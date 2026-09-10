import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import {
  ActivityStatus,
  EntityType,
  PlaceCategory,
  RampStatus,
  GuidingBlockStatus,
  SidewalkCondition,
  SurfaceCondition,
  SeatingAvailability,
  ToiletAccessibility,
  LightingLevel,
  CrowdLevel,
} from '@prisma/client';
import {
  analyzeAccessibilityActivity,
  synthesizeLocationInsightsWithAI,
} from '../services/aiOrchestrator.service.js';

const createActivitySchema = z.object({
  title: z.string().min(2, 'Activity name must be at least 2 characters'),
  description: z.string().min(5, 'Activity description must be at least 5 characters'),
  mediaUrls: z.array(z.string().url()).default([]),
  specificLocation: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationId: z.string().uuid().optional().nullable(),
  status: z.nativeEnum(ActivityStatus).default(ActivityStatus.PUBLIC),
  accessibilityTags: z.array(z.string()).default([]),
  userObservedHints: z.object({
    rampStatus: z.nativeEnum(RampStatus).optional(),
    guidingBlockStatus: z.nativeEnum(GuidingBlockStatus).optional(),
    sidewalkCondition: z.nativeEnum(SidewalkCondition).optional(),
    surfaceCondition: z.nativeEnum(SurfaceCondition).optional(),
    seatingAvailability: z.nativeEnum(SeatingAvailability).optional(),
    toiletAccessibility: z.nativeEnum(ToiletAccessibility).optional(),
    lightingLevel: z.nativeEnum(LightingLevel).optional(),
    crowdLevel: z.nativeEnum(CrowdLevel).optional(),
  }).optional(),
});

/**
 * Mengambil daftar aktivitas crowdsource / feed komunitas
 */
export async function getActivitiesController(req: Request, res: Response): Promise<void> {
  try {
    const {
      locationId,
      userId,
      status = 'PUBLIC',
      search,
      limit = '30',
      page = '1',
    } = req.query;

    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = status as ActivityStatus;
    }

    if (locationId && typeof locationId === 'string') {
      where.locationId = locationId;
    }

    if (userId && typeof userId === 'string') {
      where.userId = userId;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { specificLocation: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(250, Math.max(1, parseInt(limit as string, 10) || 100));
    const skip = (Math.max(1, parseInt(page as string, 10) || 1) - 1) * take;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
          location: {
            select: {
              id: true,
              name: true,
              entityType: true,
              category: true,
              overallScore: true,
            },
          },
          _count: {
            select: { comments: true },
          },
        },
      }),
      prisma.activity.count({ where }),
    ]);

    res.json({
      success: true,
      count: activities.length,
      total,
      page: parseInt(page as string, 10) || 1,
      totalPages: Math.ceil(total / take),
      data: activities,
    });
  } catch (error: any) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities', message: error.message });
  }
}

/**
 * Mengambil detail satu aktivitas
 */
export async function getActivityByIdController(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);

    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            entityType: true,
            category: true,
            overallScore: true,
            rampStatus: true,
            guidingBlockStatus: true,
            sidewalkCondition: true,
          },
        },
        comments: {
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
        },
      },
    });

    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    res.json({
      success: true,
      data: activity,
    });
  } catch (error: any) {
    console.error('Error fetching activity by id:', error);
    res.status(500).json({ error: 'Failed to fetch activity details', message: error.message });
  }
}

/**
 * Membuat postingan Activity baru (Wajib Login)
 * Otomatis dianalisis oleh AI Orchestrator untuk menghitung skor dan memperbarui wawasan Tempat terkait.
 */
export async function createActivityController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const validated = createActivitySchema.parse(req.body);
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      res.status(401).json({ error: 'User must be authenticated to create an activity' });
      return;
    }

    // Pastikan user ada di database (sinkronisasi dari Supabase Auth)
    await prisma.user.upsert({
      where: { id: userId },
      update: {
        email: req.user?.email || `user_${userId.slice(0, 8)}@difamap.id`,
        name: req.user?.email ? req.user.email.split('@')[0] : 'DifaMap Contributor',
      },
      create: {
        id: userId,
        email: req.user?.email || `user_${userId.slice(0, 8)}@difamap.id`,
        name: req.user?.email ? req.user.email.split('@')[0] : 'DifaMap Contributor',
      },
    });

    // Cek apakah ada target location yang terhubung
    let targetLocationId = validated.locationId || null;
    const primaryPhoto =
      (validated.mediaUrls || []).find((u) => !u.includes('_map_') && !u.endsWith('.png')) ||
      validated.mediaUrls?.[0] ||
      null;

    // Jika user mengisi specificLocation tetapi tidak menyertakan locationId secara eksplisit,
    // cocokkan dengan nama tempat / alamat di database
    if (!targetLocationId && validated.specificLocation && validated.specificLocation.trim() !== '') {
      const matchedLocation = await prisma.location.findFirst({
        where: {
          OR: [
            { name: { contains: validated.specificLocation.trim(), mode: 'insensitive' } },
            { specificLocation: { contains: validated.specificLocation.trim(), mode: 'insensitive' } },
          ],
        },
      });

      if (matchedLocation) {
        targetLocationId = matchedLocation.id;
      }
    }

    // 1. Eksekusi Analisis & Scoring AI Murni
    const aiAnalysis = await analyzeAccessibilityActivity({
      title: validated.title,
      description: validated.description,
      specificLocation: validated.specificLocation,
      mediaUrls: validated.mediaUrls,
      userObservedHints: validated.userObservedHints,
    });

    // Otomatis Buat atau Perbarui Tempat (Location) dari Aktivitas
    if (targetLocationId) {
      // Jika tempat sudah ada: perbarui atau tambahkan fotonya
      if (primaryPhoto) {
        await prisma.location.update({
          where: { id: targetLocationId },
          data: {
            coverImageUrl: primaryPhoto,
            totalActivities: { increment: 1 },
          },
        });
      } else {
        await prisma.location.update({
          where: { id: targetLocationId },
          data: { totalActivities: { increment: 1 } },
        });
      }
    } else {
      // Cari apakah ada lokasi dalam radius ~80 meter (~0.0008 deg)
      const nearbyLocation = await prisma.location.findFirst({
        where: {
          latitude: { gte: validated.latitude - 0.0008, lte: validated.latitude + 0.0008 },
          longitude: { gte: validated.longitude - 0.0008, lte: validated.longitude + 0.0008 },
        },
      });

      if (nearbyLocation) {
        targetLocationId = nearbyLocation.id;
        if (primaryPhoto && (!nearbyLocation.coverImageUrl || nearbyLocation.coverImageUrl.includes('unsplash.com'))) {
          await prisma.location.update({
            where: { id: nearbyLocation.id },
            data: {
              coverImageUrl: primaryPhoto,
              totalActivities: { increment: 1 },
            },
          });
        } else {
          await prisma.location.update({
            where: { id: nearbyLocation.id },
            data: { totalActivities: { increment: 1 } },
          });
        }
      } else {
        // Otomatis buat Tempat baru dari foto & data aktivitas jika belum ada
        const titleLower = validated.title.toLowerCase();
        let entityType: EntityType = EntityType.PLACE;
        let category: PlaceCategory = PlaceCategory.OTHER;

        if (titleLower.includes('halte') || titleLower.includes('shelter') || titleLower.includes('stasiun')) {
          entityType = EntityType.TRANSIT_HUB;
          category = PlaceCategory.BUS_STOP;
        } else if (titleLower.includes('trotoar') || titleLower.includes('jalan') || titleLower.includes('jl.')) {
          entityType = EntityType.SIDEWALK;
          category = PlaceCategory.PEDESTRIAN_PATH;
        } else if (titleLower.includes('mall') || titleLower.includes('plaza')) {
          category = PlaceCategory.MALL;
        } else if (
          titleLower.includes('rs') ||
          titleLower.includes('rumah sakit') ||
          titleLower.includes('klinik') ||
          titleLower.includes('puskesmas')
        ) {
          category = PlaceCategory.HEALTHCARE;
        } else if (
          titleLower.includes('unhas') ||
          titleLower.includes('kampus') ||
          titleLower.includes('sekolah') ||
          titleLower.includes('universitas')
        ) {
          category = PlaceCategory.EDUCATION;
        }

        const autoCreatedLoc = await prisma.location.create({
          data: {
            name: validated.specificLocation || validated.title,
            specificLocation: validated.specificLocation || 'Kota Makassar',
            description: validated.description || 'Titik survei aksesibilitas fasilitas publik.',
            coverImageUrl: primaryPhoto,
            latitude: validated.latitude,
            longitude: validated.longitude,
            overallScore: aiAnalysis.overallScore || 4.0,
            physicalScore: aiAnalysis.physicalScore || 4.0,
            safetyScore: aiAnalysis.safetyScore || 4.0,
            aiConfidence: aiAnalysis.aiConfidence,
            aiSummary: aiAnalysis.summary,
            aiInsights: {
              barrierType: aiAnalysis.barrierType,
              actionRecommendation: aiAnalysis.actionRecommendation,
              tags: aiAnalysis.tags,
            },
            rampStatus: aiAnalysis.observedParameters.rampStatus,
            guidingBlockStatus: aiAnalysis.observedParameters.guidingBlockStatus,
            sidewalkCondition: aiAnalysis.observedParameters.sidewalkCondition,
            surfaceCondition: aiAnalysis.observedParameters.surfaceCondition,
            seatingAvailability: aiAnalysis.observedParameters.seatingAvailability,
            toiletAccessibility: aiAnalysis.observedParameters.toiletAccessibility,
            lightingLevel: aiAnalysis.observedParameters.lightingLevel,
            crowdLevel: aiAnalysis.observedParameters.crowdLevel,
            entityType,
            category,
            totalActivities: 1,
          },
        });
        targetLocationId = autoCreatedLoc.id;
      }
    }

    // Gabungkan tags dari input user dan hasil ekstraksi AI
    const combinedTags = Array.from(
      new Set([...(validated.accessibilityTags || []), ...aiAnalysis.tags])
    );

    // 2. Simpan Activity ke Database
    const newActivity = await prisma.activity.create({
      data: {
        userId,
        locationId: targetLocationId,
        title: validated.title,
        description: validated.description,
        mediaUrls: validated.mediaUrls,
        specificLocation: validated.specificLocation || null,
        latitude: validated.latitude,
        longitude: validated.longitude,
        status: validated.status,
        accessibilityTags: combinedTags,
        aiScore: aiAnalysis.overallScore,
        aiConfidence: aiAnalysis.aiConfidence,
        aiAnalysis: {
          summary: aiAnalysis.summary,
          barrierType: aiAnalysis.barrierType,
          actionRecommendation: aiAnalysis.actionRecommendation,
          physicalScore: aiAnalysis.physicalScore,
          safetyScore: aiAnalysis.safetyScore,
          aiConfidence: aiAnalysis.aiConfidence,
        },
        observedParameters: aiAnalysis.observedParameters,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            category: true,
            overallScore: true,
          },
        },
      },
    });

    // 3. Jika terhubung ke Location terdaftar, AI akan mensintesis ulang rating & deskripsi Tempat terkait
    // Jika tidak ada/kosong, tempat di database tidak berubah (hanya menjadi postingan aktivitas komunitas)
    if (targetLocationId && validated.status === ActivityStatus.PUBLIC) {
      synthesizeLocationInsightsWithAI(targetLocationId).catch((err) =>
        console.error('Background AI synthesis error for location:', err)
      );
    }

    res.status(201).json({
      success: true,
      message: targetLocationId
        ? 'Activity posted and linked to registered location. AI has updated the location score and insights.'
        : 'Activity posted successfully as community feed.',
      data: newActivity,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating activity:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Mengubah status / data Activity (misal dari Draft ke Public)
 */
export async function updateActivityController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const activity = await prisma.activity.findUnique({ where: { id } });
    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    if (activity.userId !== userId && req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You are not the author of this activity' });
      return;
    }

    const { status, title, description, mediaUrls, specificLocation } = req.body;

    const updated = await prisma.activity.update({
      where: { id },
      data: {
        status: status ? (status as ActivityStatus) : undefined,
        title: title || undefined,
        description: description || undefined,
        mediaUrls: mediaUrls || undefined,
        specificLocation: specificLocation || undefined,
      },
    });

    // Jika berubah jadi public dan memiliki locationId, sintesis ulang
    if (updated.locationId && updated.status === ActivityStatus.PUBLIC) {
      synthesizeLocationInsightsWithAI(updated.locationId).catch(console.error);
    }

    res.json({
      success: true,
      message: 'Activity updated successfully',
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update activity', message: error.message });
  }
}
