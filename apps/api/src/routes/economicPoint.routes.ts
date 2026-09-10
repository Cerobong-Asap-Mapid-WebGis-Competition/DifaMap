import { Router } from 'express';
import { getEconomicPointsController } from '../controllers/economicPoint.controller.js';

const router = Router();

// GET /api/economic-points (Menu Go & Properti Go)
router.get('/', getEconomicPointsController);

export default router;
