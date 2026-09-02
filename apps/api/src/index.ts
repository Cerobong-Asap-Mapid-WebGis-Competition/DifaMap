import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';

const app = express();

// Middleware
app.use(compression()); // Gzip/Brotli compression untuk data cepat & ringan
// Origin dibatasi ke daftar di CORS_ORIGINS. Sebelumnya '*', yang berarti
// situs mana pun bisa memanggil API ini memakai token Supabase pengunjungnya.
const allowedOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Permintaan tanpa header Origin (curl, health check, server-to-server)
    // tetap diizinkan; CORS memang hanya berlaku untuk browser.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin tidak diizinkan oleh kebijakan CORS: ${origin}`));
  },
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
  console.log(`🚀 [DifaMap API] Server running on http://localhost:${env.PORT}`);
  console.log(`🗺️  [DifaMap API] MAPID Proxy available on http://localhost:${env.PORT}/api/mapid`);
  console.log(`🔒 [DifaMap API] CORS origin diizinkan: ${allowedOrigins.join(', ')}`);
});

export default app;
