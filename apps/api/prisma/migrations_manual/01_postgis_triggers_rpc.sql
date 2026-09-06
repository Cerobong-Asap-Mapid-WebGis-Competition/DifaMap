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
-- 0. PEMBERSIHAN ARTEFAK SKRIP LAMA
--
-- Database sungguhan ternyata masih memuat objek dari versi skrip terdahulu
-- (terverifikasi 2 Sep 2026). Dua di antaranya membuat skrip ini gagal atau
-- berbahaya bila dibiarkan:
--
--   calculate_buffer_economic_score(...) -> json
--     Versi lama mengembalikan `json`, versi ini `jsonb`. CREATE OR REPLACE
--     tidak bisa mengubah tipe kembalian, jadi harus di-DROP lebih dulu.
--
--   update_location_accessibility_score()
--     Fungsi lama yang merata-ratakan skor laporan lalu menimpanya ke skor
--     resmi lokasi. Triggernya sudah tidak ada karena tabel `reports` sudah
--     dihapus, tapi fungsinya masih menggantung dan bisa terpasang ulang
--     tanpa sengaja. Dibuang.
--
--   sync_location_geometry() + trigger trg_sync_location_geometry
--     Berganti nama menjadi sync_geometry_from_latlng() karena kini dipakai
--     tiga tabel, bukan hanya locations. Nama lamanya dibersihkan agar tidak
--     ada dua trigger yang mengerjakan hal sama.
--
-- Bagian ini membuat skrip aman dijalankan berulang kali.
-- ------------------------------------------------------------------------------
-- Seluruh trigger yang bergantung pada fungsi lama harus dilepas lebih dulu;
-- economic_points memakai NAMA trigger yang sama dengan versi baru, tapi masih
-- menunjuk fungsi lama. Ketiganya dipasang ulang di bagian 3.
DROP TRIGGER IF EXISTS trg_sync_location_geometry        ON public.locations;
DROP TRIGGER IF EXISTS trg_sync_locations_geometry       ON public.locations;
DROP TRIGGER IF EXISTS trg_sync_economic_points_geometry ON public.economic_points;
DROP TRIGGER IF EXISTS trg_sync_activities_geometry      ON public.activities;
DROP TRIGGER IF EXISTS trg_update_location_accessibility ON public.locations;

DROP FUNCTION IF EXISTS public.sync_location_geometry();
DROP FUNCTION IF EXISTS public.update_location_accessibility_score();
DROP FUNCTION IF EXISTS public.calculate_buffer_economic_score(uuid, double precision);
DROP FUNCTION IF EXISTS public.refresh_priority_index(uuid);


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
-- ------------------------------------------------------------------------------
-- 6a. PARAMETER YANG DAPAT DIKALIBRASI
--
-- Semua angka yang belum terbukti dikumpulkan di sini sebagai fungsi terpisah,
-- bukan disebar sebagai konstanta di tengah rumus. Kalibrasi ulang cukup dengan
-- mengganti nilai di fungsi-fungsi ini, tanpa menyentuh logika perhitungan.
--
-- STATUS: BELUM TERKALIBRASI. Semua nilai di bawah adalah asumsi awal dan wajib
-- diuji ulang setelah data survei serta Menu Go / Properti Go asli masuk.
-- DEVELOPMENT.md Bab 12 menuntut formula yang transparan dan terdokumentasi.
-- ------------------------------------------------------------------------------

-- Bobot komponen kerusakan pada Accessibility Priority Index.
-- Asal angka: ditetapkan di PRD tanpa penurunan empiris.
-- Cara menguji: jalankan ulang daftar prioritas pada 0.5, 0.6, dan 0.7. Bila
-- 5 besarnya tidak berubah, bobot ini tidak menentukan hasil — dan itu justru
-- argumen yang kuat saat mempertanggungjawabkannya.
CREATE OR REPLACE FUNCTION public.weight_damage()
RETURNS DOUBLE PRECISION AS $$ SELECT 0.6::DOUBLE PRECISION $$ LANGUAGE sql IMMUTABLE;

-- Bobot komponen ekonomi. Selalu 1 - weight_damage().
CREATE OR REPLACE FUNCTION public.weight_economy()
RETURNS DOUBLE PRECISION AS $$ SELECT 1.0 - public.weight_damage() $$ LANGUAGE sql IMMUTABLE;

-- Titik jenuh skor ekonomi: berapa "poin berbobot" yang dianggap kepadatan
-- maksimum (skor 100). Nilai 50 berarti sekitar 33 titik Menu Go dalam radius.
-- Angka ini murni tebakan sampai data asli ada. Cara mengganti yang benar:
-- hitung persentil ke-90 kepadatan Menu Go + Properti Go per radius 200m dari
-- data sungguhan, lalu pakai angka itu di sini.
CREATE OR REPLACE FUNCTION public.economic_saturation_points()
RETURNS DOUBLE PRECISION AS $$ SELECT 50.0::DOUBLE PRECISION $$ LANGUAGE sql IMMUTABLE;


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
        (public.weight_damage()  * public.damage_score_from_accessibility(NEW.overall_score)) +
        (public.weight_economy() * COALESCE(NEW.economic_score, 0.0))
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
-- Bobot dan titik jenuh diambil dari fungsi di bagian 6a agar bisa dikalibrasi
-- tanpa menyentuh logika di sini.
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

    -- Poin berbobot dinormalisasi terhadap titik jenuh, bukan dikali angka ajaib.
    computed_econ := LEAST(100.0, (
        (menu_go_count     * 1.5) +
        (properti_go_count * 2.0) +
        (commercial_count  * 1.0)
    ) / public.economic_saturation_points() * 100.0);

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
