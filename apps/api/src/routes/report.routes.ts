import { Router } from 'express';
import {
  createReportController,
  getLocationsController,
  recalculateEconomicScoreController,
} from '../controllers/report.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Laporan Komunitas & Analisis AI
router.post('/reports', createReportController);

// Lokasi Transit & Skor Prioritas
router.get('/locations', getLocationsController);

// Eksekusi PostGIS RPC Buffer & Skor Ekonomi
router.post('/locations/:id/economic-buffer', recalculateEconomicScoreController);

export default router;
