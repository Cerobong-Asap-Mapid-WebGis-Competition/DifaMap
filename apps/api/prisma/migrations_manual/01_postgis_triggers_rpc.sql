-- ==============================================================================
-- DifaMap WebGIS - Database Initialization, Triggers & PostGIS RPC Functions
-- Run this script in the Supabase SQL Editor
-- ==============================================================================

-- 1. AKTIVASI EKSTENSI POSTGIS
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Pastikan tabel-tabel Prisma sudah dibuat atau dieksekusi via `npx prisma db push`
-- Berikut skrip DDL pelengkap, Spatial Index, dan Triggers

-- 2. SPATIAL INDEXING (GIST)
-- Mempercepat spatial query (ST_DWithin, ST_Buffer, ST_Contains)
CREATE INDEX IF NOT EXISTS idx_locations_geom ON public.locations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_economic_points_geom ON public.economic_points USING GIST (geom);

-- 3. TRIGGER: AUTO-SYNC GEOMETRY DARI LATITUDE & LONGITUDE
-- Memastikan kolom geom selalu terisi PostGIS Point (SRID 4326) dari lat/lng
CREATE OR REPLACE FUNCTION public.sync_location_geometry()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_location_geometry ON public.locations;
CREATE TRIGGER trg_sync_location_geometry
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.sync_location_geometry();

DROP TRIGGER IF EXISTS trg_sync_economic_points_geometry ON public.economic_points;
CREATE TRIGGER trg_sync_economic_points_geometry
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.economic_points
FOR EACH ROW
EXECUTE FUNCTION public.sync_location_geometry();


-- 4. TRIGGER: AUTO-SYNC SUPABASE AUTH KE PUBLIC USERS TABLE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, name, avatar_url, role, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        'USER'::"Role",
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- 5. TRIGGER: AUTO-CALCULATE ACCESSIBILITY & PRIORITY SCORE
-- Dijalankan setiap ada INSERT, UPDATE, atau DELETE di tabel `reports`
CREATE OR REPLACE FUNCTION public.update_location_accessibility_score()
RETURNS TRIGGER AS $$
DECLARE
    target_loc_id UUID;
    calc_avg_score FLOAT;
    calc_count INT;
    calc_damage_score FLOAT; -- 0 (Bagus) hingga 100 (Sangat Rusak)
    current_econ_score FLOAT;
    final_priority_index FLOAT;
BEGIN
    -- Tentukan target location_id (handle INSERT/UPDATE/DELETE)
    IF (TG_OP = 'DELETE') THEN
        target_loc_id := OLD.location_id;
    ELSE
        target_loc_id := NEW.location_id;
    END IF;

    -- Hitung rata-rata skor laporan komunitas
    -- Menggabungkan user_score dan ai_score jika tersedia
    SELECT
        COALESCE(AVG(COALESCE((user_score + COALESCE(ai_score, user_score)) / 2.0, user_score)), 0.0),
        COUNT(id)
    INTO
        calc_avg_score,
        calc_count
    FROM public.reports
    WHERE location_id = target_loc_id AND status != 'REJECTED';

    -- Batasi nilai min 1.0 dan max 5.0 (Clamping jika ada laporan)
    IF calc_count > 0 THEN
        calc_avg_score := LEAST(5.0, GREATEST(1.0, calc_avg_score));
        -- Konversi skor aksesibilitas (1-5) menjadi Skor Kerusakan (0 - 100)
        -- Nilai 1 (Sangat Buruk) => Kerusakan 100
        -- Nilai 5 (Sangat Baik)  => Kerusakan 0
        calc_damage_score := ((5.0 - calc_avg_score) / 4.0) * 100.0;
    ELSE
        calc_avg_score := 0.0;
        calc_damage_score := 0.0;
    END IF;

    -- Ambil skor ekonomi saat ini dari lokasi
    SELECT COALESCE(economic_score, 0.0) INTO current_econ_score
    FROM public.locations
    WHERE id = target_loc_id;

    -- Rumus Proposal DifaMap (Accessibility Priority Index):
    -- Priority Index = (0.6 * Skor Kerusakan) + (0.4 * Skor Kepadatan Ekonomi)
    final_priority_index := (0.6 * calc_damage_score) + (0.4 * current_econ_score);

    -- Update tabel locations
    UPDATE public.locations
    SET
        avg_accessibility_score = ROUND(calc_avg_score::numeric, 2),
        priority_index = ROUND(final_priority_index::numeric, 2),
        total_reports = calc_count,
        updated_at = NOW()
    WHERE id = target_loc_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_location_accessibility ON public.reports;
CREATE TRIGGER trg_update_location_accessibility
AFTER INSERT OR UPDATE OR DELETE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.update_location_accessibility_score();


-- 6. POSTGIS RPC FUNCTION: calculate_buffer_economic_score
-- Menghitung skor kepadatan ekonomi dalam radius X meter (default 500m)
-- Menggunakan ST_DWithin geografi (WGS84) dengan presisi meter
CREATE OR REPLACE FUNCTION public.calculate_buffer_economic_score(
    loc_id UUID,
    radius_meters DOUBLE PRECISION DEFAULT 500.0
)
RETURNS JSONB AS $$
DECLARE
    loc_geom GEOMETRY;
    total_points INT := 0;
    menu_go_count INT := 0;
    properti_go_count INT := 0;
    commercial_count INT := 0;
    computed_economic_score FLOAT := 0.0;
    calc_avg_acc_score FLOAT := 0.0;
    calc_damage_score FLOAT := 0.0;
    final_priority_index FLOAT := 0.0;
    result JSONB;
BEGIN
    -- 1. Ambil geometri lokasi target
    SELECT geom, avg_accessibility_score INTO loc_geom, calc_avg_acc_score
    FROM public.locations
    WHERE id = loc_id;

    IF loc_geom IS NULL THEN
        RAISE EXCEPTION 'Location with ID % not found or has null geometry', loc_id;
    END IF;

    -- 2. Hitung jumlah titik ekonomi dalam radius menggunakan ST_DWithin (Casting ke geography)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE type = 'MENU_GO'),
        COUNT(*) FILTER (WHERE type = 'PROPERTI_GO'),
        COUNT(*) FILTER (WHERE type = 'COMMERCIAL')
    INTO
        total_points,
        menu_go_count,
        properti_go_count,
        commercial_count
    FROM public.economic_points
    WHERE ST_DWithin(
        geom::geography,
        loc_geom::geography,
        radius_meters
    );

    -- 3. Normalisasi skor ekonomi (Skala 0 - 100)
    -- Asumsi benchmark: 50+ titik ekonomi dalam radius 500m bernilai 100 poin
    computed_economic_score := LEAST(100.0, (
        (menu_go_count * 1.5) +
        (properti_go_count * 2.0) +
        (commercial_count * 1.0)
    ) * 2.0);

    -- 4. Hitung ulang Accessibility Priority Index
    IF calc_avg_acc_score > 0 THEN
        calc_damage_score := ((5.0 - calc_avg_acc_score) / 4.0) * 100.0;
    ELSE
        calc_damage_score := 0.0;
    END IF;

    final_priority_index := (0.6 * calc_damage_score) + (0.4 * computed_economic_score);

    -- 5. Update tabel locations
    UPDATE public.locations
    SET
        economic_score = ROUND(computed_economic_score::numeric, 2),
        priority_index = ROUND(final_priority_index::numeric, 2),
        updated_at = NOW()
    WHERE id = loc_id;

    -- 6. Susun hasil JSON output untuk Supabase RPC
    result := jsonb_build_object(
        'location_id', loc_id,
        'radius_meters', radius_meters,
        'total_economic_points', total_points,
        'menu_go_count', menu_go_count,
        'properti_go_count', properti_go_count,
        'commercial_count', commercial_count,
        'computed_economic_score', ROUND(computed_economic_score::numeric, 2),
        'updated_priority_index', ROUND(final_priority_index::numeric, 2)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
