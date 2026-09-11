import { Router } from 'express';
import {
  createCommentController,
  getCommentsByLocationController,
  getCommentsByActivityController,
  getCommentsByPlaceController,
} from '../controllers/comment.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Wajib Login untuk mengirimkan ulasan / komentar
router.post('/', requireAuth, createCommentController);

// Publik bisa membaca komentar ulasan
router.get('/location/:locationId', getCommentsByLocationController);
router.get('/activity/:activityId', getCommentsByActivityController);

// Komentar tentang sebuah TEMPAT - gabungan pengamatan, bukan satu baris basis
// data. Penandanya slug dari src/data/tempatPilihan.ts.
router.get('/place/:placeKey', getCommentsByPlaceController);

export default router;
