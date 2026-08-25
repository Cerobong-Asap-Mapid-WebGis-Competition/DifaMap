# DifaMap Developer & AI Agent Operating Guidelines

Dokumen ini adalah pedoman standar operasional untuk developer dan **AI Coding Assistant** (Antigravity, Gemini, Copilot, Cursor, dll.) saat menulis kode, menginstal package, melakukan refactoring, menjalankan migrasi database, dan mengelola repository **DifaMap**.

---

## 1. Aturan Pengelolaan Monorepo & Instalasi Package

Repository ini menggunakan arsitektur **npm Workspaces & Turborepo**:
* `apps/api`: Backend Express.js + Prisma + TypeScript + PostGIS.
* `apps/web`: Frontend Next.js 15 + MapLibre GL + TypeScript.
* `packages/tsconfig`: Konfigurasi dasar TypeScript bersama.

### Aturan Instalasi Dependensi:
1. **Jangan menjalankan `npm i <package>` di root jika package hanya dibutuhkan oleh sub-aplikasi**.
2. **Gunakan flag `--workspace`**:
   - Untuk backend:
     ```bash
     npm install <package-name> --workspace=@difamap/api
     ```
   - Untuk frontend:
     ```bash
     npm install <package-name> --workspace=@difamap/web
     ```
   - Untuk devDependencies:
     ```bash
     npm install -D <package-name> --workspace=@difamap/api
     ```

---

## 2. Aturan Prisma ORM & Solusi Garis Merah (*Type Sync*)

Prisma Client pada backend DifaMap terhubung dengan ekstensi **PostGIS** dan **Supabase PostgreSQL**.

### Siklus Update Database Schema (`apps/api/prisma/schema.prisma`):
1. **Setelah mengubah `schema.prisma`**, selalu jalankan:
   ```bash
   cd apps/api
   npm run db:generate
   ```
2. **Sinkronisasi Otomatis ke `apps/api/node_modules`**:
   Karena npm workspaces meng-hoist `@prisma/client` ke root `node_modules`, IDE (seperti VSCode) pada sub-folder `apps/api` membutuhkan copy `.prisma` agar tidak memunculkan garis merah (*red squiggles*).
   Jalankan script powershell:
   ```powershell
   Copy-Item -Path "node_modules/.prisma" -Destination "apps/api/node_modules/.prisma" -Recurse -Force
   Copy-Item -Path "node_modules/@prisma" -Destination "apps/api/node_modules/@prisma" -Recurse -Force
   ```
3. **Penerapan Perubahan ke Database Supabase**:
   - Untuk sinkronisasi langsung (Development):
     ```bash
     cd apps/api
     npm run db:push
     ```

---

## 3. Standar Penulisan Kode Backend (`apps/api`)

1. **Format Modul ESM (ECMAScript Modules)**:
   - Menggunakan `"type": "module"` pada `package.json`.
   - **Wajib menyertakan ekstensi `.js`** saat mengimpor file lokal internal (misal: `import { prisma } from '../lib/prisma.js';`).
2. **Validasi Request dengan Zod**:
   - Semua body payload atau parameter query yang masuk ke controller wajib divalidasi melalui schema `zod` (`z.object({...}).parse(req.body)`).
3. **Autentikasi & Otorisasi**:
   - Endpoint publik (melihat map, detail lokasi, feed aktivitas, analisis MAPID) **tidak boleh** memblokir akses tamu (*guest*).
   - Endpoint posting aktivitas, ulasan komentar, dan modifikasi data **wajib** menggunakan middleware `requireAuth` (`Authorization: Bearer <supabase_token>`).
4. **AI Error Fallback**:
   - Setiap pemanggilan ke OpenAI / eksternal API wajib dibungkus dalam blok `try...catch` dengan nilai fallback heuristik agar server API tidak pernah *crash* jika layanan pihak ketiga mengalami limit/timeout.

---

## 4. Validasi Sebelum Push / Commit ke Git

Setiap developer atau AI **WAJIB** memvalidasi bahwa build dan typecheck lulus sebelum menyimpan perubahan:

1. **Jalankan Lint / Typecheck**:
   ```bash
   cd apps/api && npm run lint
   cd ../web && npm run lint
   ```
   *Pastikan kedua perintah menghasilkan exit code 0 (`tsc --noEmit` tanpa error).*
2. **Cek Keamanan File `.env`**:
   - Pastikan file `.env` tidak pernah ter-commit ke git repository (selalu berada di `.gitignore`).
   - Perbarui `.env.example` jika menambahkan variabel lingkungan baru.

---

## 5. Ringkasan Perintah Penting (Cheatsheet)

| Perintah | Lokasi | Fungsi |
| :--- | :--- | :--- |
| `npm run dev` | Root / `apps/api` | Menjalankan backend server (`tsx watch src/index.ts` di port 4000) |
| `npm run dev` | `apps/web` | Menjalankan frontend Next.js dev server di port 3000 |
| `npm run db:generate` | `apps/api` | Men-generate TypeScript client dari `schema.prisma` |
| `npm run db:push` | `apps/api` | Menerapkan struktur tabel Prisma ke database Supabase |
| `npm run db:studio` | `apps/api` | Membuka GUI Prisma Studio di browser untuk melihat data |
| `npm run lint` | `apps/api` / `apps/web` | Mengecek seluruh error TypeScript secara instan |
