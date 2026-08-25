import { Router } from 'express';
import {
  getActivitiesController,
  getActivityByIdController,
  createActivityController,
  updateActivityController,
} from '../controllers/activity.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { activityCreateLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

// Guest & Publik bisa melihat daftar & detail aktivitas
router.get('/', getActivitiesController);
router.get('/:id', getActivityByIdController);

// User wajib terautentikasi (Login) untuk memposting atau memperbarui aktivitas
router.post('/', requireAuth, activityCreateLimiter, createActivityController);
router.patch('/:id', requireAuth, updateActivityController);

export default router;

