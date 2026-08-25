import { Router } from 'express';
import {
  createCommentController,
  getCommentsByLocationController,
  getCommentsByActivityController,
} from '../controllers/comment.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Wajib Login untuk mengirimkan ulasan / komentar
router.post('/', requireAuth, createCommentController);

// Publik bisa membaca komentar ulasan
router.get('/location/:locationId', getCommentsByLocationController);
router.get('/activity/:activityId', getCommentsByActivityController);

export default router;
