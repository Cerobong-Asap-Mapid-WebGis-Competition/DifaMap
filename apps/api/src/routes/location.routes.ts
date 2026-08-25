import { Router } from 'express';
import {
  getLocationsController,
  getNearbyLocationsController,
  getLocationByIdController,
  createLocationController,
  recalculateEconomicScoreController,
  reSynthesizeLocationController,
} from '../controllers/location.controller.js';

const router = Router();

// Pencarian Spasial Terdekat (PostGIS Proximity Search)
router.get('/nearby', getNearbyLocationsController);

router.get('/', getLocationsController);
router.get('/:id', getLocationByIdController);
router.post('/', createLocationController);
router.post('/:id/calculate-economic', recalculateEconomicScoreController);
router.post('/:id/resynthesize', reSynthesizeLocationController);

export default router;

