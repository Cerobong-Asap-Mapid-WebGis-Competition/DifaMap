import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';

const app = express();

// Middleware
app.use(cors({
  origin: '*', // Pada tahap produksi sesuaikan dengan domain Next.js
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
});

export default app;
