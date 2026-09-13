# Serah Terima untuk Deploy

Catatan untuk Wildan. Isinya tiga hal: apa yang berubah di luar kode, apa yang
harus disiapkan di hosting, dan apa yang masih menggantung.

---

## 1. Yang berubah di luar kode — perlu perhatian saat deploy

### Bucket Supabase Storage baru: `laporan-foto`

Dibuat untuk fitur unggah foto pada "Bagikan Laporan". Sebelumnya kolom foto
meminta URL yang ditempel sendiri, dan praktis tidak ada yang mengisinya.

| | |
|---|---|
| Nama | `laporan-foto` |
| Publik | ya — agar peta dan Difa AI bisa membacanya |
| Batas | 5 MB |
| Jenis | JPG, PNG, WebP |

Bucket ini sudah ada di proyek Supabase yang sama, jadi tidak perlu dibuat lagi.
Yang perlu dipastikan: `SUPABASE_SERVICE_ROLE_KEY` terisi di hosting, sebab
unggahan memakai kunci itu.

Ada satu berkas uji 1×1 piksel di dalamnya (`2026-09-12/bba974c3-….png`), boleh
dihapus kapan saja.

### Kolom `place_key` pada tabel `comments`

Sudah ada di basis data **dan** di `schema.prisma`, jadi tidak ada beda skema.
Dipakai komentar yang menempel pada sebuah TEMPAT, bukan pada satu titik survei
di dalamnya.

### Variabel lingkungan baru

- `ORS_API_KEY` — OpenRouteService, untuk rute dan isokron kursi roda
- `ORS_BASE_URL` — `https://api.openrouteservice.org`
- `CORS_ORIGINS` — **baru dipakai**, lihat di bawah
- `TRUST_PROXY_HOPS` — **baru**, lihat di bawah

---

## 2. Yang harus disiapkan di hosting

### API

```
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      wajib — dipakai unggah foto
OPENAI_API_KEY
MAPID_API_KEY                  wajib — cadangan yang tertulis di kode sudah dihapus
MAPID_BASE_URL
MAPID_BASEMAP_URL
MAPID_GEOSERVER_URL
MAPID_COMPETITION_URL
MAPID_PROJECT_ID
ORS_API_KEY
ORS_BASE_URL
PORT
NODE_ENV=production

CORS_ORIGINS=https://domain-web-difamap
TRUST_PROXY_HOPS=1
```

**`CORS_ORIGINS`** — isi dengan domain web DifaMap, dipisah koma bila lebih dari
satu. Dibiarkan kosong, API terbuka untuk situs mana pun: siapa saja bisa
memanggilnya dan menghabiskan jatah OpenAI serta OpenRouteService kita. Saat
`NODE_ENV=production` dan variabel ini kosong, server mencetak peringatan di log
saat start.

**`TRUST_PROXY_HOPS`** — jumlah lapis proxy di depan server. `1` untuk hosting
biasa seperti Railway atau Render; `2` bila ada Cloudflare di depannya. Ini
menentukan IP mana yang dianggap milik pengunjung. Salah setel, pembatas laju
120 permintaan per 15 menit berubah dari jatah per orang menjadi jatah bersama
SELURUH pengunjung — dan satu orang yang banyak bertanya memblokir yang lain.

Saat start, server mencetak keduanya supaya mudah diperiksa:

```
🚀 [DifaMap API] Server running on port 4000
   CORS  : https://difamap.example
   Proxy : mempercayai 1 lapis
```

### Web

```
NEXT_PUBLIC_API_URL=https://domain-api-difamap
```

**Harus terisi SEBELUM `npm run build`.** Next.js membakar setiap `NEXT_PUBLIC_*`
ke dalam bundel pada waktu build — mengisinya setelah web terbangun tidak
mengubah apa pun. Bila lupa, bundelnya membawa `http://localhost:4000`, dan
setiap pengunjung akan memanggil komputernya sendiri lalu melihat peta tanpa
satu pun titik, tanpa pesan galat apa pun. Peringatannya dimunculkan di konsol
peramban, tetapi hanya terlihat bila konsolnya dibuka.

### Prisma

`apps/api` sudah punya `postinstall: prisma generate`, jadi `npm install` di
hosting akan membuat Prisma Client dengan sendirinya. Tanpa itu API mati saat
start — dan ini penyebab kegagalan deploy pertama yang paling sering.

### Versi Node

`engines: { node: ">=20 <25" }` di `package.json` akar. Pengembangan lokal
memakai Node 25, tetapi batas atas dipasang karena beberapa hosting belum
menyediakannya.

---

## 3. Yang masih menggantung — butuh keputusan tim

### Baris data contoh di Supabase

Dua kelompok baris karangan masih tersimpan. Keduanya **sudah disaring dari
seluruh tampilan** — peta, chatbot, grid, panel — jadi tidak akan terlihat
siapa pun. Yang belum: menghapusnya dari basis data.

| Tabel | Jumlah | Penanda |
|---|---|---|
| `locations` | 14 | `ai_confidence` kosong |
| `economic_points` | 14 | `metadata` kosong, dibuat 28 Agustus |

Dibiarkan pun aman. Menghapusnya perlu persetujuan bersama karena basis datanya
dipakai seluruh tim.

### Data halte kembar

`Halte Mall Panakukang` dan `Halte Bus Mall Panakkukang` — dua baris untuk satu
halte, keduanya berskor 4. Begitu juga `Halte Bus Rs Grestelina` dan `Halte Bus
di RS Grestelina`. Difa AI menyebutnya sebagai halte berbeda karena memang
tercatat dua baris. Perlu diputuskan tim surveyor mana yang dihapus.

### Jatah OpenRouteService

500 isokron dan 2.000 rute per hari untuk akun gratis. Sudah dipasang simpanan
30 menit sehingga satu tindakan pengguna membayar satu kali, bukan tiga. Bila
habis, panel jatuh ke lingkaran radius dan mengatakannya terus terang - tidak
mati, hanya turun kualitasnya.

Bila ingin lebih aman saat penilaian, ajukan kenaikan jatah ke OpenRouteService;
mereka biasa mengabulkannya untuk proyek akademik.

---

## 4. Yang sudah diperiksa dan aman

- `npm run build` lolos untuk kedua aplikasi
- Tidak ada berkas `.env` yang ikut ter-commit
- `schema.prisma` sudah selaras dengan basis data
- Endpoint `/api/health` tersedia
- Server memakai `env.PORT`
- Angka Site Selection dan Site Analysis sudah dihitung ulang dari data mentah:
  nol selisih
- Teks Difa AI diperiksa terhadap data selnya: tidak ada angka karangan
