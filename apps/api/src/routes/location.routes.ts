import { Router } from 'express';
import {
  getLocationsController,
  getLocationByIdController,
  createLocationController,
  recalculateEconomicScoreController,
  reSynthesizeLocationController,
} from '../controllers/location.controller.js';

const router = Router();

router.get('/', getLocationsController);
router.get('/:id', getLocationByIdController);
router.post('/', createLocationController);
router.post('/:id/calculate-economic', recalculateEconomicScoreController);
router.post('/:id/resynthesize', reSynthesizeLocationController);

export default router;
