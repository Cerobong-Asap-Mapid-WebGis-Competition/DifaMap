-- ==========================================================================
-- 02 — Komentar untuk TEMPAT
--
-- Dijalankan sekali di SQL Editor Supabase. Aman diulang: setiap pernyataan
-- memakai IF NOT EXISTS.
--
--
-- MASALAH YANG DISELESAIKAN
--
-- Tabel `locations` berisi PENGAMATAN survei, bukan tempat. "Toilet Cinema XXI
-- Trans Studio Mall" adalah satu titik di dalam mall, bukan mallnya. Panel
-- tempat di web menggabungkan pengamatan-pengamatan itu menjadi satu tujuan
-- yang orang kenal, tetapi komentar tidak punya tempat untuk menempel: kolom
-- yang ada hanya `location_id` dan `activity_id`.
--
-- Sebelum ini, komentar tempat disauhkan ke pengamatan terdekat. Akibatnya
-- komentar tentang Trans Studio Mall tercatat sebagai komentar tentang lobinya,
-- dan berpindah-pindah tergantung pengamatan mana yang kebetulan paling dekat.
--
--
-- KENAPA KOLOM, BUKAN TABEL BARU
--
-- Tabel baru berarti objek baru yang tidak dikenal `schema.prisma` mana pun
-- selain milik kita. Kolom yang boleh kosong jauh lebih jinak:
--
--   * Kode lama tetap jalan tanpa diubah. Perintah INSERT yang tidak menyebut
--     kolom ini tetap sah, karena kolomnya NULL-able dan tanpa nilai bawaan.
--   * `location_id` dan `activity_id` memang SUDAH boleh kosong di skema saat
--     ini, jadi baris komentar tanpa keduanya tidak melanggar apa pun.
--   * Kalau suatu saat kode dikembalikan ke titik sebelumnya, yang tersisa
--     hanya satu kolom kosong yang tidak diacu siapa pun - bukan tabel
--     menggantung berisi data.
--
--
-- YANG PERLU DIKETAHUI SEBELUM MENJALANKAN
--
-- Database Supabase dipakai bersama semua branch. Sesudah kolom ini ada,
-- `schema.prisma` di branch mana pun yang MEMBACA tabel comments sebaiknya ikut
-- memuat barisnya:
--
--     placeKey  String?  @map("place_key")
--
-- Kalau tidak, `prisma db push` dari branch itu akan melihat kolom yang tidak
-- dikenalnya. Prisma memperingatkan sebelum membuang data dan meminta
-- konfirmasi - jadi tidak akan hilang diam-diam - tetapi lebih baik tidak
-- sampai ke pertanyaan itu.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- 1. Kolom penanda tempat
--
-- Isinya slug nama tempat, misalnya 'trans-studio-mall'. Sengaja TEKS bebas,
-- bukan kunci asing: daftar tempat hidup di berkas frontend
-- (src/data/tempatPilihan.ts) dan bisa bertambah tanpa menyentuh database.
-- --------------------------------------------------------------------------
ALTER TABLE public.comments
    ADD COLUMN IF NOT EXISTS place_key TEXT;

COMMENT ON COLUMN public.comments.place_key IS
    'Slug tempat dari src/data/tempatPilihan.ts, misalnya trans-studio-mall. '
    'Diisi hanya untuk komentar tentang tempat; komentar pengamatan tetap '
    'memakai location_id atau activity_id.';


-- --------------------------------------------------------------------------
-- 2. Index
--
-- Komentar selalu dibaca per tempat: WHERE place_key = $1. Tanpa index,
-- kueri itu memindai seluruh tabel komentar - tidak terasa sekarang, tetapi
-- memburuk seiring komentar bertambah.
--
-- Index parsial: baris dengan place_key NULL - yaitu seluruh komentar
-- pengamatan - tidak perlu ikut diindeks.
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comments_place_key
    ON public.comments (place_key)
    WHERE place_key IS NOT NULL;


-- --------------------------------------------------------------------------
-- 3. Pemeriksaan
--
-- Sebuah komentar harus menempel pada SESUATU. Tanpa aturan ini, baris dengan
-- ketiga kolom kosong bisa masuk dan menjadi komentar yatim yang tidak pernah
-- muncul di layar mana pun - dan tidak ada yang menyadarinya.
--
-- NOT VALID membuat aturan berlaku untuk baris BARU saja, tanpa memeriksa
-- ulang baris lama. Itu menghindari kegagalan bila ada baris lama yang
-- terlanjur kosong.
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'comments_punya_induk'
    ) THEN
        ALTER TABLE public.comments
            ADD CONSTRAINT comments_punya_induk
            CHECK (
                location_id IS NOT NULL
                OR activity_id IS NOT NULL
                OR place_key IS NOT NULL
            ) NOT VALID;
    END IF;
END $$;


-- --------------------------------------------------------------------------
-- 4. Hasil
-- --------------------------------------------------------------------------
SELECT
    'place_key'            AS kolom,
    data_type              AS tipe,
    is_nullable            AS boleh_kosong
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'comments'
  AND column_name = 'place_key';
