-- ==============================================================================
-- DifaMap WebGIS - PostGIS, Trigger & RPC
-- Jalankan di Supabase SQL Editor SETELAH `npx prisma db push`.
--
-- Skrip ini mengacu ke schema.prisma yang berlaku: tabel `locations`,
-- `activities`, `comments`, `economic_points`. Versi sebelumnya masih menunjuk
-- tabel `reports` beserta kolom `user_score`, `avg_accessibility_score`, dan
-- `total_reports` yang sudah tidak ada, sehingga seluruh trigger dan RPC gagal
-- dibuat dan `priority_index` tidak pernah terisi.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EKSTENSI
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;


-- ------------------------------------------------------------------------------
-- 2. SPATIAL INDEX (GIST)
-- Mempercepat ST_DWithin, ST_Contains, dan pencarian titik terdekat.
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_locations_geom        ON public.locations       USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_economic_points_geom  ON public.economic_points USING GIST (geom);
-- activities.geom sebelumnya tidak pernah diindeks maupun diisi.
CREATE INDEX IF NOT EXISTS idx_activities_geom       ON public.activities      USING GIST (geom);


-- ------------------------------------------------------------------------------
-- 3. SINKRONISASI GEOMETRI DARI LATITUDE & LONGITUDE
-- Kolom geom diisi otomatis supaya query spasial memakai index, bukan
-- membangun ulang ST_MakePoint per baris.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_geometry_from_latlng()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_locations_geometry ON public.locations;
CREATE TRIGGER trg_sync_locations_geometry
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.sync_geometry_from_latlng();

DROP TRIGGER IF EXISTS trg_sync_economic_points_geometry ON public.economic_points;
CREATE TRIGGER trg_sync_economic_points_geometry
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.economic_points
FOR EACH ROW EXECUTE FUNCTION public.sync_geometry_from_latlng();

-- Activities punya kolom geom sejak awal tapi tidak pernah ada trigger yang
-- mengisinya, sehingga seluruh nilainya NULL.
DROP TRIGGER IF EXISTS trg_sync_activities_geometry ON public.activities;
CREATE TRIGGER trg_sync_activities_geometry
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.sync_geometry_from_latlng();

-- Isi ulang baris yang sudah terlanjur tersimpan tanpa geometri.
UPDATE public.locations
   SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
 WHERE geom IS NULL;

UPDATE public.economic_points
   SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
 WHERE geom IS NULL;

UPDATE public.activities
   SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
 WHERE geom IS NULL;


-- ------------------------------------------------------------------------------
-- 4. SINKRONISASI SUPABASE AUTH -> public.users
-- ------------------------------------------------------------------------------
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
    SET email      = EXCLUDED.email,
        name       = COALESCE(EXCLUDED.name, public.users.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ------------------------------------------------------------------------------
-- 5. PENGHITUNG KONTRIBUSI KOMUNITAS
--
-- PENTING: trigger ini memperbarui pencacah dan community_score, tetapi TIDAK
-- PERNAH menyentuh overall_score. DEVELOPMENT.md Bab 10 fitur 5 dan Bab 11 menyatakan kontribusi
-- pengguna tidak boleh mengubah skor resmi — skor resmi berasal dari penilaian
-- AI atas data survei, bukan dari postingan komunitas. Versi lama menghitung
-- rata-rata skor laporan lalu menimpanya ke kolom skor lokasi; itu membuat
-- siapa pun yang login bisa menggeser skor resmi lewat teks yang ia tulis.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_location_activity_count()
RETURNS TRIGGER AS $$
DECLARE
    target_loc_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_loc_id := OLD.location_id;
    ELSE
        target_loc_id := NEW.location_id;
    END IF;

    IF target_loc_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Skor komunitas dihitung di sini, ke kolom community_score yang TERPISAH.
    -- overall_score (skor resmi dari survei) sengaja tidak disentuh sama sekali.
    -- NULL bila belum ada laporan sama sekali — berbeda maknanya dengan 0.
    UPDATE public.locations
       SET total_activities = (
               SELECT COUNT(*) FROM public.activities
                WHERE location_id = target_loc_id
                  AND status = 'PUBLIC'::"ActivityStatus"
           ),
           community_report_count = (
               SELECT COUNT(*) FROM public.activities
                WHERE location_id = target_loc_id
                  AND status = 'PUBLIC'::"ActivityStatus"
                  AND ai_score IS NOT NULL
           ),
           community_score = (
               SELECT ROUND(AVG(ai_score)::numeric, 2) FROM public.activities
                WHERE location_id = target_loc_id
                  AND status = 'PUBLIC'::"ActivityStatus"
                  AND ai_score IS NOT NULL
           ),
           updated_at = NOW()
     WHERE id = target_loc_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refresh_location_activity_count ON public.activities;
CREATE TRIGGER trg_refresh_location_activity_count
AFTER INSERT OR UPDATE OR DELETE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.refresh_location_activity_count();


CREATE OR REPLACE FUNCTION public.refresh_location_comment_count()
RETURNS TRIGGER AS $$
DECLARE
    target_loc_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_loc_id := OLD.location_id;
    ELSE
        target_loc_id := NEW.location_id;
    END IF;

    IF target_loc_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE public.locations
       SET total_comments = (
               SELECT COUNT(*) FROM public.comments WHERE location_id = target_loc_id
           ),
           updated_at = NOW()
     WHERE id = target_loc_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refresh_location_comment_count ON public.comments;
CREATE TRIGGER trg_refresh_location_comment_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.refresh_location_comment_count();


-- ------------------------------------------------------------------------------
-- 6. ACCESSIBILITY PRIORITY INDEX
--
--   API = (0.6 x Skor Kerusakan) + (0.4 x Skor Ekonomi)
--
--   Skor Kerusakan : kebalikan overall_score (1-5) dinormalisasi ke 0-100.
--                    overall_score 5 (sangat baik)  -> kerusakan 0
--                    overall_score 1 (sangat buruk) -> kerusakan 100
--   Skor Ekonomi   : kepadatan Menu Go / Properti Go di sekitar titik (0-100),
--                    dihitung oleh calculate_buffer_economic_score di bawah.
--
--   Arah pembacaan: priority_index TINGGI = kondisi buruk & ramai = prioritas
--   perbaikan tinggi. Berlawanan arah dengan overall_score, jangan tertukar.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.damage_score_from_accessibility(acc_score DOUBLE PRECISION)
RETURNS DOUBLE PRECISION AS $$
BEGIN
    -- overall_score bernilai 0 berarti belum dinilai AI, bukan "sangat buruk".
    IF acc_score IS NULL OR acc_score <= 0 THEN
        RETURN 0.0;
    END IF;
    RETURN ((5.0 - LEAST(5.0, GREATEST(1.0, acc_score))) / 4.0) * 100.0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- priority_index dijaga oleh trigger BEFORE UPDATE, bukan dihitung di banyak
-- tempat. Dengan begitu nilainya tidak pernah basi: begitu AI memperbarui
-- overall_score lewat Prisma, atau RPC memperbarui economic_score, indeksnya
-- ikut terhitung ulang dalam transaksi yang sama.
--
-- Ditulis sebagai BEFORE trigger yang mengubah NEW secara langsung, bukan
-- AFTER trigger yang menjalankan UPDATE lagi — supaya tidak memicu dirinya
-- sendiri tanpa henti.
CREATE OR REPLACE FUNCTION public.sync_priority_index()
RETURNS TRIGGER AS $$
BEGIN
    NEW.priority_index := ROUND((
        (0.6 * public.damage_score_from_accessibility(NEW.overall_score)) +
        (0.4 * COALESCE(NEW.economic_score, 0.0))
    )::numeric, 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_priority_index ON public.locations;
CREATE TRIGGER trg_sync_priority_index
BEFORE INSERT OR UPDATE OF overall_score, economic_score ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.sync_priority_index();


-- ------------------------------------------------------------------------------
-- 7. RPC: SKOR EKONOMI DALAM RADIUS
--
-- Menghitung kepadatan titik ekonomi di sekitar sebuah lokasi, lalu memperbarui
-- economic_score dan priority_index.
--
-- CATATAN KALIBRASI: pembobotan di bawah masih angka sementara. Titik jenuh
-- (skor 100) tercapai pada sekitar 33 titik Menu Go dalam radius. Bobot dan
-- ambang ini HARUS dikalibrasi ulang setelah data Menu Go / Properti Go asli
-- masuk, lalu didokumentasikan — PRD Bab 12 menuntut formula yang transparan.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_buffer_economic_score(
    loc_id         UUID,
    radius_meters  DOUBLE PRECISION DEFAULT 200.0
)
RETURNS JSONB AS $$
DECLARE
    loc_geom          GEOMETRY;
    total_points      INT   := 0;
    menu_go_count     INT   := 0;
    properti_go_count INT   := 0;
    commercial_count  INT   := 0;
    computed_econ     DOUBLE PRECISION := 0.0;
    new_priority      DOUBLE PRECISION := 0.0;
BEGIN
    SELECT geom INTO loc_geom FROM public.locations WHERE id = loc_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Location % tidak ditemukan', loc_id;
    END IF;

    IF loc_geom IS NULL THEN
        RAISE EXCEPTION 'Location % belum punya geometri (cek latitude/longitude)', loc_id;
    END IF;

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE type = 'MENU_GO'::"EconomicType"),
           COUNT(*) FILTER (WHERE type = 'PROPERTI_GO'::"EconomicType"),
           COUNT(*) FILTER (WHERE type = 'COMMERCIAL'::"EconomicType")
      INTO total_points, menu_go_count, properti_go_count, commercial_count
      FROM public.economic_points
     WHERE ST_DWithin(geom::geography, loc_geom::geography, radius_meters);

    computed_econ := LEAST(100.0, (
        (menu_go_count     * 1.5) +
        (properti_go_count * 2.0) +
        (commercial_count  * 1.0)
    ) * 2.0);

    UPDATE public.locations
       SET economic_score = ROUND(computed_econ::numeric, 2),
           updated_at     = NOW()
     WHERE id = loc_id;

    -- trg_sync_priority_index sudah menghitung ulang priority_index pada UPDATE
    -- di atas; di sini cukup dibaca kembali untuk dilaporkan ke pemanggil.
    SELECT priority_index INTO new_priority FROM public.locations WHERE id = loc_id;

    RETURN jsonb_build_object(
        'location_id',             loc_id,
        'radius_meters',           radius_meters,
        'total_economic_points',   total_points,
        'menu_go_count',           menu_go_count,
        'properti_go_count',       properti_go_count,
        'commercial_count',        commercial_count,
        'computed_economic_score', ROUND(computed_econ::numeric, 2),
        'updated_priority_index',  ROUND(new_priority::numeric, 2)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ------------------------------------------------------------------------------
-- 8. HITUNG ULANG MASSAL
-- Dijalankan sekali setelah impor data survei atau data ekonomi selesai.
-- Radius 200m mengikuti buffer spatial join di DEVELOPMENT.md Bab 7.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_all_priority_index(
    radius_meters DOUBLE PRECISION DEFAULT 200.0
)
RETURNS INT AS $$
DECLARE
    row_loc  RECORD;
    affected INT := 0;
BEGIN
    FOR row_loc IN SELECT id FROM public.locations WHERE geom IS NOT NULL LOOP
        PERFORM public.calculate_buffer_economic_score(row_loc.id, radius_meters);
        affected := affected + 1;
    END LOOP;

    RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
