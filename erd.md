# Entity Relationship Diagram (ERD) & Penjelasan Database Schema - DifaMap

Dokumen ini berisi dokumentasi skema database Prisma untuk backend **DifaMap WebGIS** (`apps/api/prisma/schema.prisma`), relasi antar tabel, dan Entity Relationship Diagram (ERD).

---

## 1. Diagram ERD (Entity Relationship Diagram)

```mermaid
erDiagram
    %% ==========================================
    %% ENUMS (Sebagai Tipe Data Referensi)
    %% ==========================================

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
        string name "Nama titik fasilitas/halte/stasiun"
        LocationCategory category "BUS_STOP | TRANSIT_HUB | dll"
        string description "Deskripsi lokasi (nullable)"
        float latitude "Koordinat lintang (WGS84)"
        float longitude "Koordinat bujur (WGS84)"
        geometry geom "PostGIS Point SRID 4326 (nullable)"
        float avg_accessibility_score "Skor rata-rata aksesibilitas (1.0-5.0)"
        float economic_score "Skor kerapatan ekonomi (0.0-100.0)"
        float priority_index "Indeks prioritas perbaikan fasilitas"
        int total_reports "Jumlah total laporan masuk"
        datetime created_at "Timestamp pembuatan"
        datetime updated_at "Timestamp update"
    }

    reports {
        uuid id PK "gen_random_uuid()"
        uuid user_id FK "Relasi ke users.id"
        uuid location_id FK "Relasi ke locations.id"
        FacilityType facility_type "RAMP | GUIDING_BLOCK | SIDEWALK | dll"
        DamageSeverity damage_severity "NONE | LOW | MODERATE | SEVERE"
        string description "Keterangan detail kondisi fasilitas"
        string photo_url "Bukti foto fasilitas (nullable)"
        float user_score "Skor penilaian pengguna (1.0 - 5.0)"
        float ai_score "Skor hasil validasi AI (nullable)"
        json ai_analysis "Hasil ekstraksi AI (isu, rintangan, rekomendasi)"
        ReportStatus status "PENDING | VERIFIED | REJECTED | RESOLVED"
        datetime created_at "Timestamp pembuatan laporan"
        datetime updated_at "Timestamp update laporan"
    }

    economic_points {
        uuid id PK "gen_random_uuid()"
        string name "Nama tempat / bisnis / properti"
        EconomicType type "MENU_GO | PROPERTI_GO | COMMERCIAL"
        float weight "Bobot aktivitas / foot traffic (default 1.0)"
        float latitude "Koordinat lintang (WGS84)"
        float longitude "Koordinat bujur (WGS84)"
        geometry geom "PostGIS Point SRID 4326 (nullable)"
        json metadata "Data atribut tambahan"
        datetime created_at "Timestamp pembuatan data"
    }

    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    users ||--o{ reports : "membuat (1:N, onDelete: Cascade)"
    locations ||--o{ reports : "memiliki (1:N, onDelete: Cascade)"
    locations ..o{ economic_points : "dianalisis spasial via PostGIS (ST_DWithin/ST_Distance)"
```

---

## 2. Penjelasan Detail Model & Struktur Tabel

Database DifaMap dirancang di atas **PostgreSQL** dengan ekstensi **PostGIS** dan terintegrasi langsung dengan **Supabase Auth**.

### A. Tabel `users` (`User`)
Tabel penyimpan data pengguna aplikasi.
* **Tujuan**: Menghubungkan identitas autentikasi Supabase (`auth.users`) dengan data laporan di DifaMap.
* **Kolom Kunci**:
  * `id` (`UUID`): Primary Key yang mereferensikan UUID pengguna dari Supabase Auth.
  * `role` (`Role` enum): Peran pengguna (`USER`, `SURVEYOR`, `ADMIN`) untuk kontrol akses (RBAC).
  * `email`, `name`, `avatar_url`: Profil pengguna.
* **Relasi**:
  * Memiliki relasi **1-ke-Banyak (One-to-Many)** dengan tabel `reports`.

---

### B. Tabel `locations` (`Location`)
Tabel penyimpan titik infrastruktur publik, transportasi massal, maupun segmen trotoar.
* **Tujuan**: Menjadi entitas sentral pemetaan spasial fasilitas aksesibilitas ramah disabilitas.
* **Kolom Kunci**:
  * `id` (`UUID`): Primary Key (auto-generated UUID).
  * `category` (`LocationCategory` enum): Klasifikasi titik (`BUS_STOP`, `TRANSIT_HUB`, `TRAIN_STATION`, `PEDESTRIAN_CROSSING`, `SIDEWALK_SEGMENT`).
  * `latitude`, `longitude`, `geom`: Koordinat numerik serta kolom geometri PostGIS (`Point, 4326`) untuk operasi spasial.
  * **Metrik & Skor Agregasi**:
    * `avg_accessibility_score`: Rata-rata skor aksesibilitas (rentang 1.0 = buruk s.d. 5.0 = sangat aksesibel) yang dihitung dari agregasi laporan.
    * `economic_score`: Skor kerapatan ekonomi (0.0 - 100.0) di sekitar titik lokasi.
    * `priority_index`: Indeks prioritas intervensi perbaikan yang dihitung dari formula gabungan: `(0.6 × Skor Kerusakan) + (0.4 × Skor Ekonomi)`.
    * `total_reports`: Jumlah laporan yang masuk pada lokasi ini.
* **Relasi**:
  * Memiliki relasi **1-ke-Banyak (One-to-Many)** dengan tabel `reports`.

---

### C. Tabel `reports` (`Report`)
Tabel crowdsourcing laporan kondisi fasilitas aksesibilitas disabilitas dari masyarakat / surveyor.
* **Tujuan**: Mencatat riwayat aduan, bukti foto, tingkat kerusakan, dan validasi AI.
* **Kolom Kunci**:
  * `id` (`UUID`): Primary Key.
  * `user_id` (`UUID`): Foreign Key yang merujuk ke `users.id`.
  * `location_id` (`UUID`): Foreign Key yang merujuk ke `locations.id`.
  * `facility_type` (`FacilityType` enum): Jenis fasilitas yang dilaporkan (`RAMP`, `GUIDING_BLOCK`, `SIDEWALK`, `ELEVATOR`, `TACTILE_SIGNAGE`, `CROSSING`, `OTHER`).
  * `damage_severity` (`DamageSeverity` enum): Tingkat kerusakan (`NONE`, `LOW`, `MODERATE`, `SEVERE`).
  * `user_score`: Skor penilaian dari pelapor (1.0 s.d. 5.0).
  * `ai_score` & `ai_analysis`: Hasil orkestrasi AI (OpenAI/Vision) yang mengekstrak ringkasan rintangan, rekomendasi perbaikan, dan validasi foto.
  * `status` (`ReportStatus` enum): Status alur laporan (`PENDING`, `VERIFIED`, `REJECTED`, `RESOLVED`).
* **Relasi**:
  * **Many-to-One** ke `users` (`onDelete: Cascade`).
  * **Many-to-One** ke `locations` (`onDelete: Cascade`).

---

### D. Tabel `economic_points` (`EconomicPoint`)
Tabel penyimpan data spasial sekunder pendukung analisis prioritas (Point of Interest ekonomi).
* **Tujuan**: Menyimpan data titik kuliner/UMKM (*Menu Go*), properti & kepadatan bangunan (*Properti Go*), dan kawasan komersial.
* **Kolom Kunci**:
  * `id` (`UUID`): Primary Key.
  * `type` (`EconomicType` enum): Tipe data (`MENU_GO`, `PROPERTI_GO`, `COMMERCIAL`).
  * `weight`: Bobot aktivitas/keramaian (*foot traffic*).
  * `geom`: Kolom PostGIS Point SRID 4326.
  * `metadata`: Data atribut JSON tambahan dari sumber data eksternal.
* **Relasi Spasial**:
  * Tabel ini berdiri sendiri (*standalone spatial table*), tetapi dihubungkan dengan tabel `locations` melalui **query kalkulasi spasial PostGIS** (seperti `ST_DWithin` / `ST_Distance` dalam radius tertentu) untuk menghitung nilai `economic_score` dan `priority_index` pada lokasi.

---

## 3. Ringkasan Sambungan & Relasi Antar Tabel

| Hubungan | Tipe Relasi | Foreign Key & Constraint | Deskripsi & Dampak Aksi |
| :--- | :--- | :--- | :--- |
| **`User` ➜ `Report`** | One-to-Many (`1 : N`) | `reports.user_id` ➜ `users.id`<br>`onDelete: Cascade` | Satu pengguna dapat membuat banyak laporan. Jika akun pengguna dihapus, seluruh laporannya ikut terhapus (*Cascade*). |
| **`Location` ➜ `Report`** | One-to-Many (`1 : N`) | `reports.location_id` ➜ `locations.id`<br>`onDelete: Cascade` | Satu lokasi fasilitas publik dapat memiliki banyak laporan dari berbagai pengguna. Jika lokasi dihapus, seluruh laporannya ikut terhapus. |
| **`Location` ⬌ `EconomicPoint`** | Spasial GIS (Proximity) | *Tidak menggunakan FK relasional, melainkan PostGIS functions (`ST_DWithin`)* | Digunakan oleh backend/DB trigger untuk mengagregasi bobot ekonomi di sekitar titik lokasi guna menentukan `priority_index`. |
