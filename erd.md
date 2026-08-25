# Entity Relationship Diagram (ERD) & Penjelasan Database Schema - DifaMap

Dokumen ini berisi dokumentasi resmi skema database Prisma untuk backend **DifaMap WebGIS** (`apps/api/prisma/schema.prisma`), relasi antar entitas, tipe enum parameter aksesibilitas fisik, keamanan, temporal, serta Entity Relationship Diagram (ERD).

---

## 1. Diagram ERD (Entity Relationship Diagram)

```mermaid
erDiagram
    %% ==========================================
    %% ENTITIES / TABLES
    %% ==========================================

    users {
        uuid id PK "auth.users UUID (Supabase Auth)"
        string email UK "Unique email address"
        string name "User full name (nullable)"
        string avatar_url "Avatar image URL (nullable)"
        Role role "USER | SURVEYOR | ADMIN"
        datetime created_at "Timestamp pembuatan"
        datetime updated_at "Timestamp update"
    }

    locations {
        uuid id PK "gen_random_uuid()"
        string name "Nama Tempat / Nama Ruas Trotoar"
        EntityType entity_type "PLACE | SIDEWALK | TRANSIT_HUB"
        PlaceCategory category "MALL | RESTAURANT | TOURISM | BUS_STOP | dll"
        string specific_location "Detail alamat / patokan lokasi (nullable)"
        string description "Deskripsi umum (nullable)"
        string cover_image_url "Foto utama tempat / trotoar (nullable)"
        float latitude "Koordinat lintang (WGS84)"
        float longitude "Koordinat bujur (WGS84)"
        geometry geom "PostGIS Point SRID 4326 (nullable)"
        RampStatus ramp_status "GOOD | DAMAGED | NONE"
        GuidingBlockStatus guiding_block_status "GOOD | DAMAGED | NONE"
        SidewalkCondition sidewalk_condition "GOOD | NARROW | DAMAGED | BLOCKED | NOT_APPLICABLE"
        SurfaceCondition surface_condition "SMOOTH | SLIPPERY | POTHOLE | UNEVEN"
        SeatingAvailability seating_availability "AVAILABLE | NOT_AVAILABLE"
        ToiletAccessibility toilet_accessibility "AVAILABLE_GOOD | AVAILABLE_DAMAGED | NOT_AVAILABLE"
        LightingLevel lighting_level "BRIGHT | DIM | DARK"
        CrowdLevel crowd_level "QUIET | MODERATE | CROWDED"
        string peak_hours "Contoh: 07:00-09:00, 17:00-19:30"
        string safe_visit_time "Contoh: 08:00 - 17:00"
        WeeklyPattern weekly_pattern "WEEKDAY_BUSY | WEEKEND_BUSY | BALANCED"
        float overall_score "Rating 1.0 - 5.0 (Dihitung Murni oleh AI)"
        float physical_score "Skor fisik 1.0 - 5.0"
        float safety_score "Skor keamanan 1.0 - 5.0"
        string ai_summary "Ringkasan poin-poin aksesibilitas hasil AI"
        json ai_insights "Detail poin kekuatan, rintangan & rekomendasi"
        float economic_score "Skor kerapatan ekonomi MAPID (0.0 - 100.0)"
        float priority_index "Indeks prioritas intervensi perbaikan"
        int total_activities "Jumlah total postingan aktivitas ter-tag"
        int total_comments "Jumlah komentar ulasan"
        datetime created_at "Timestamp pembuatan"
        datetime updated_at "Timestamp update"
    }

    activities {
        uuid id PK "gen_random_uuid()"
        uuid user_id FK "Relasi ke users.id"
        uuid location_id FK "Relasi opsional ke locations.id (nullable)"
        string title "Activity Name (misal: Mampir lihat Danau UNHAS)"
        string description "Activity Description (caption detail)"
        string[] media_urls "Array URL foto-foto aktivitas"
        string specific_location "Nama tempat / jalan yang diinput user"
        float latitude "Koordinat lintang dari Pick Location"
        float longitude "Koordinat bujur dari Pick Location"
        geometry geom "PostGIS Point SRID 4326 (nullable)"
        ActivityStatus status "DRAFT | PUBLIC | ARCHIVED"
        string[] accessibility_tags "Tag aksesibilitas (Kursi Roda, Ramp, dll)"
        float ai_score "Skor evaluasi AI (1.0 - 5.0)"
        json ai_analysis "Hasil ekstraksi AI (isu, rintangan, rekomendasi)"
        json observed_parameters "Parameter fisik terdeteksi AI"
        datetime created_at "Timestamp pembuatan"
        datetime updated_at "Timestamp update"
    }

    comments {
        uuid id PK "gen_random_uuid()"
        uuid user_id FK "Relasi ke users.id"
        uuid location_id FK "Relasi opsional ke locations.id (nullable)"
        uuid activity_id FK "Relasi opsional ke activities.id (nullable)"
        string content "Teks komentar / ulasan pengguna"
        string[] photo_urls "Array URL foto lampiran ulasan"
        datetime created_at "Timestamp ulasan"
        datetime updated_at "Timestamp update"
    }

    economic_points {
        uuid id PK "gen_random_uuid()"
        string name "Nama tempat / bisnis / properti"
        EconomicType type "MENU_GO | PROPERTI_GO | COMMERCIAL"
        float weight "Bobot aktivitas / foot traffic (default 1.0)"
        float latitude "Koordinat lintang (WGS84)"
        float longitude "Koordinat bujur (WGS84)"
        geometry geom "PostGIS Point SRID 4326 (nullable)"
        json metadata "Data atribut tambahan MAPID"
        datetime created_at "Timestamp pembuatan data"
    }

    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    users ||--o{ activities : "membuat aktivitas (1:N, onDelete: Cascade)"
    users ||--o{ comments : "menulis ulasan/komentar (1:N, onDelete: Cascade)"
    locations ||--o{ activities : "memiliki aktivitas berlabel (0:N, onDelete: SetNull)"
    locations ||--o{ comments : "menerima ulasan (0:N, onDelete: Cascade)"
    activities ||--o{ comments : "menerima komentar diskusi (0:N, onDelete: Cascade)"
    locations ..o{ economic_points : "analisis buffer spasial PostGIS (ST_DWithin)"
```

---

## 2. Penjelasan Detail Model & Struktur Tabel

Database DifaMap dirancang di atas **PostgreSQL** dengan ekstensi **PostGIS** dan terintegrasi langsung dengan **Supabase Auth**.

### A. Tabel `users` (`User`)
Tabel penyimpan data pengguna aplikasi.
* **Tujuan**: Menghubungkan identitas autentikasi Supabase (`auth.users`) dengan data aktivitas dan komentar di DifaMap.
* **Kolom Kunci**:
  * `id` (`UUID`): Primary Key yang mereferensikan UUID pengguna dari Supabase Auth.
  * `role` (`Role` enum): Peran pengguna (`USER`, `SURVEYOR`, `ADMIN`) untuk kontrol akses (RBAC).
  * `email`, `name`, `avatar_url`: Profil pengguna.

---

### B. Tabel `locations` (`Location`)
Tabel penyimpan titik infrastruktur publik (Mall, Wisata, Restoran, Halte) dan segmen jalan/trotoar publik.
* **Tujuan**: Menjadi entitas sentral pemetaan spasial dan visualisasi pin/kartu tempat & trotoar.
* **Kategori Entitas**:
  * `entity_type`: `PLACE` (mall, restoran, wisata), `SIDEWALK` (jalan/trotoar), `TRANSIT_HUB` (halte, stasiun).
* **Parameter Fisik & Aksesibilitas**:
  * `ramp_status`: `GOOD` | `DAMAGED` | `NONE`
  * `guiding_block_status`: `GOOD` | `DAMAGED` | `NONE`
  * `sidewalk_condition`: `GOOD` | `NARROW` | `DAMAGED` | `BLOCKED` | `NOT_APPLICABLE` (Khusus jalan trotoar)
  * `surface_condition`: `SMOOTH` | `SLIPPERY` | `POTHOLE` | `UNEVEN`
  * `seating_availability`: `AVAILABLE` | `NOT_AVAILABLE`
  * `toilet_accessibility`: `AVAILABLE_GOOD` | `AVAILABLE_DAMAGED` | `NOT_AVAILABLE`
* **Parameter Keamanan & Kenyamanan**:
  * `lighting_level`: `BRIGHT` | `DIM` | `DARK`
  * `crowd_level`: `QUIET` | `MODERATE` | `CROWDED`
* **Parameter Temporal**:
  * `peak_hours`: Rentang jam ramai (misal: "07:00-09:00, 17:00-19:30").
  * `safe_visit_time`: Waktu terbaik & paling aman dikunjungi (misal: "08:00 - 17:00").
  * `weekly_pattern`: `WEEKDAY_BUSY` | `WEEKEND_BUSY` | `BALANCED`.
* **Scoring & AI Insights (Scoring Murni AI)**:
  * `overall_score`: Nilai rating bintang 1.0 - 5.0 yang dihitung murni oleh AI.
  * `ai_summary`: Deskripsi poin-poin ringkas hasil sintesis AI dari laporan aktivitas.
  * `ai_insights`: JSON terstruktur berisi kekuatan (*strengths*), rintangan (*barriers*), dan saran perbaikan.

---

### C. Tabel `activities` (`Activity`)
Tabel crowdsourcing aktivitas/cerita/laporan komunitas berbasis multi-foto (sesuai UI tab Activity & Create Activity).
* **Tujuan**: Pengguna terautentikasi dapat membagikan postingan foto kondisi fasilitas/aktivitas di lokasi tertentu.
* **Kolom Kunci**:
  * `id` (`UUID`): Primary Key.
  * `user_id` (`UUID`): Foreign Key merujuk ke `users.id`.
  * `location_id` (`UUID`, nullable): Foreign Key merujuk ke `locations.id` jika aktivitas dilabelkan pada tempat terdaftar.
  * `title`: Nama aktivitas (Activity Name).
  * `description`: Deskripsi cerita/laporan (Activity Description).
  * `media_urls`: Array string URL foto-foto yang diunggah.
  * `specific_location`: Nama tempat / jalan spesifik yang diketik pengguna.
  * `latitude`, `longitude`, `geom`: Koordinat hasil pin lokasi (*Pick Location*).
  * `status`: `DRAFT` | `PUBLIC` | `ARCHIVED`.
  * `ai_score` & `ai_analysis`: Hasil evaluasi AI terhadap postingan, foto, dan isu aksesibilitas yang terdeteksi.

---

### D. Tabel `comments` (`Comment`)
Tabel ulasan dan komentar pengguna untuk Tempat maupun Aktivitas.
* **Tujuan**: Memungkinkan pengguna terautentikasi menulis ulasan, tips aksesibilitas, dan diskusi.
* **Kolom Kunci**:
  * `id` (`UUID`): Primary Key.
  * `user_id` (`UUID`): Penulis komentar.
  * `location_id` (`UUID`, nullable): Relasi ke Tempat/Trotoar yang diulas.
  * `activity_id` (`UUID`, nullable): Relasi ke Aktivitas yang dikomentari.
  * `content`: Teks ulasan.
  * `photo_urls`: Lampiran foto ulasan jika ada.

---

## 3. Ringkasan Sambungan & Relasi Antar Tabel

| Hubungan | Tipe Relasi | Foreign Key & Constraint | Deskripsi & Dampak Aksi |
| :--- | :--- | :--- | :--- |
| **`User` ➜ `Activity`** | One-to-Many (`1 : N`) | `activities.user_id` ➜ `users.id`<br>`onDelete: Cascade` | Pengguna dapat membuat banyak postingan aktivitas. Jika akun dihapus, aktivitasnya ikut terhapus. |
| **`Location` ➜ `Activity`** | One-to-Many (`0 : N`) | `activities.location_id` ➜ `locations.id`<br>`onDelete: SetNull` | Tempat dapat memiliki banyak aktivitas berlabel. Jika tempat dihapus, `location_id` di activity di-set null. |
| **`User` ➜ `Comment`** | One-to-Many (`1 : N`) | `comments.user_id` ➜ `users.id`<br>`onDelete: Cascade` | Pengguna dapat menulis ulasan di banyak tempat atau aktivitas. |
| **`Location` ➜ `Comment`** | One-to-Many (`0 : N`) | `comments.location_id` ➜ `locations.id`<br>`onDelete: Cascade` | Tempat dapat memiliki banyak ulasan dari berbagai pengguna. |
| **`Activity` ➜ `Comment`** | One-to-Many (`0 : N`) | `comments.activity_id` ➜ `activities.id`<br>`onDelete: Cascade` | Postingan aktivitas dapat memiliki utas diskusi komentar. |
| **`Location` ⬌ `EconomicPoint`** | Spasial GIS (Buffer Proximity) | *Tidak menggunakan FK relasional, melainkan PostGIS functions (`ST_DWithin`)* | Digunakan untuk mengagregasi bobot ekonomi di sekitar titik lokasi guna menentukan `priority_index`. |
