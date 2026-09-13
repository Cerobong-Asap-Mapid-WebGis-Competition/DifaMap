import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';

const app = express();

/**
 * Lapis proxy yang dipercaya.
 *
 * Harus dipasang SEBELUM pembatas laju apa pun: express-rate-limit membaca
 * req.ip, dan nilai itu ditentukan oleh setelan ini. Tanpanya, seluruh
 * pengunjung di belakang proxy terbaca ber-IP sama dan berbagi satu jatah.
 */
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// Normalisasi URL (misal '//api/...' menjadi '/api/...') agar tidak 404 bila klien menyertakan trailing slash
app.use((req, _res, next) => {
  if (req.url.startsWith('//')) {
    req.url = req.url.replace(/^\/+/, '/');
  }
  next();
});

// Middleware
app.use(compression()); // Gzip/Brotli compression untuk data cepat & ringan

/**
 * Daftar domain yang boleh memanggil, bukan lagi terbuka untuk siapa saja.
 *
 * CORS_ORIGINS sebenarnya sudah lama ada di berkas .env, tetapi tidak pernah
 * dibaca kode - niatnya ada, penerapannya belum. Dibiarkan kosong, perilakunya
 * tetap terbuka seperti sebelumnya supaya pengembangan lokal tidak terganggu;
 * begitu diisi di produksi, hanya domain itu yang dilayani.
 */
const domainDiizinkan = (env.CORS_ORIGINS ?? '')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

if (domainDiizinkan.length === 0 && env.NODE_ENV === 'production') {
  console.warn(
    '[CORS] CORS_ORIGINS kosong di produksi - API ini terbuka untuk situs mana pun. ' +
      'Isi dengan domain web DifaMap, dipisah koma.'
  );
}

app.use(cors({
  origin: domainDiizinkan.length > 0 ? domainDiizinkan : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routing API
app.use('/api', apiRouter);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
});

app.listen(env.PORT, () => {
  console.log(`🚀 [DifaMap API] Server running on port ${env.PORT}`);
  console.log(`   CORS  : ${domainDiizinkan.length > 0 ? domainDiizinkan.join(', ') : 'TERBUKA (semua domain)'}`);
  console.log(`   Proxy : mempercayai ${env.TRUST_PROXY_HOPS} lapis`);
});

export default app;
