import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

const createCommentSchema = z.object({
  locationId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
  // Tempat bukan baris basis data, melainkan gabungan pengamatan yang dikenali
  // orang sebagai satu tujuan. Penandanya karena itu teks bebas, bukan UUID.
  placeKey: z.string().min(1).max(120).optional().nullable(),
  content: z.string().min(1, 'Comment content cannot be empty'),
  photoUrls: z.array(z.string().url()).default([]),
});

/**
 * Menambahkan komentar / ulasan pada Tempat atau Aktivitas (Wajib Login)
 */
export async function createCommentController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const validated = createCommentSchema.parse(req.body);
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      res.status(401).json({ error: 'User must be authenticated to write a comment' });
      return;
    }

    if (!validated.locationId && !validated.activityId && !validated.placeKey) {
      res.status(400).json({
        error: 'Komentar harus menempel pada locationId, activityId, atau placeKey',
      });
      return;
    }

    // Pastikan user record ada
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: req.user?.email || `user_${userId.slice(0, 8)}@difamap.id`,
        name: req.user?.email ? req.user.email.split('@')[0] : 'DifaMap User',
      },
    });

    const comment = await prisma.comment.create({
      data: {
        userId,
        locationId: validated.locationId || null,
        activityId: validated.activityId || null,
        placeKey: validated.placeKey || null,
        content: validated.content,
        photoUrls: validated.photoUrls,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update counter total komentar di Location jika di-tag ke Location
    if (validated.locationId) {
      await prisma.location.update({
        where: { id: validated.locationId },
        data: {
          totalComments: { increment: 1 },
        },
      }).catch(console.error);
    }

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: comment,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Mengambil daftar komentar untuk suatu Location
 */
/**
 * Komentar tentang sebuah TEMPAT.
 *
 * Tempat bukan baris basis data - ia gabungan beberapa pengamatan yang dikenali
 * orang sebagai satu tujuan, misalnya Trans Studio Mall yang di dalamnya ada
 * pengamatan toilet dan lobi. Karena itu penandanya slug teks, bukan kunci
 * asing, dan daftarnya hidup di frontend (src/data/tempatPilihan.ts) supaya
 * tempat bisa ditambah tanpa menyentuh basis data.
 */
export async function getCommentsByPlaceController(req: Request, res: Response): Promise<void> {
  try {
    const placeKey = String(req.params.placeKey || '').trim();

    if (!placeKey) {
      res.status(400).json({ error: 'placeKey wajib diisi' });
      return;
    }

    const comments = await prisma.comment.findMany({
      where: { placeKey },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    res.json({ success: true, count: comments.length, data: comments });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch place comments', message: error.message });
  }
}

export async function getCommentsByLocationController(req: Request, res: Response): Promise<void> {
  try {
    const locationId = String(req.params.locationId);

    const comments = await prisma.comment.findMany({
      where: { locationId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      success: true,
      count: comments.length,
      data: comments,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch comments', message: error.message });
  }
}

/**
 * Mengambil daftar komentar untuk suatu Activity
 */
export async function getCommentsByActivityController(req: Request, res: Response): Promise<void> {
  try {
    const activityId = String(req.params.activityId);

    const comments = await prisma.comment.findMany({
      where: { activityId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      success: true,
      count: comments.length,
      data: comments,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch comments', message: error.message });
  }
}
