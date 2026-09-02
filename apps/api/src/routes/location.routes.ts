import { Router } from 'express';
import {
  getLocationsController,
  getNearbyLocationsController,
  getLocationByIdController,
  createLocationController,
  recalculateEconomicScoreController,
  reSynthesizeLocationController,
} from '../controllers/location.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { Role } from '@prisma/client';

const router = Router();

// Pencarian Spasial Terdekat (PostGIS Proximity Search)
router.get('/nearby', getNearbyLocationsController);

// Publik: siapa pun boleh menjelajah peta tanpa akun (DEVELOPMENT.md Bab 11).
router.get('/', getLocationsController);
router.get('/:id', getLocationByIdController);

// Endpoint tulis & komputasi ulang sebelumnya terbuka untuk siapa saja.
// Tiga risikonya nyata: siapa pun bisa menyuntik lokasi palsu ke peta,
// memaksa hitung ulang PostGIS berulang-ulang, dan yang paling mahal —
// /resynthesize memicu panggilan OpenAI sehingga kuota API bisa dihabiskan
// orang lain. Sekarang dibatasi ke surveyor dan admin.
router.post('/', requireAuth, requireRole(Role.SURVEYOR, Role.ADMIN), createLocationController);
router.post(
  '/:id/calculate-economic',
  requireAuth,
  requireRole(Role.SURVEYOR, Role.ADMIN),
  recalculateEconomicScoreController
);
router.post(
  '/:id/resynthesize',
  requireAuth,
  requireRole(Role.SURVEYOR, Role.ADMIN),
  reSynthesizeLocationController
);

export default router;

