import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { supabase } from '../lib/supabase.js';
import {
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
  WeeklyPattern,
} from '@prisma/client';
import { synthesizeLocationInsightsWithAI } from '../services/aiOrchestrator.service.js';

// Schema validasi untuk pembuatan / pendaftaran lokasi baru
const createLocationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  entityType: z.nativeEnum(EntityType).default(EntityType.PLACE),
  category: z.nativeEnum(PlaceCategory).default(PlaceCategory.OTHER),
  specificLocation: z.string().optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  rampStatus: z.nativeEnum(RampStatus).default(RampStatus.NONE),
  guidingBlockStatus: z.nativeEnum(GuidingBlockStatus).default(GuidingBlockStatus.NONE),
  sidewalkCondition: z.nativeEnum(SidewalkCondition).default(SidewalkCondition.NOT_APPLICABLE),
  surfaceCondition: z.nativeEnum(SurfaceCondition).default(SurfaceCondition.SMOOTH),
  seatingAvailability: z.nativeEnum(SeatingAvailability).default(SeatingAvailability.NOT_AVAILABLE),
  toiletAccessibility: z.nativeEnum(ToiletAccessibility).default(ToiletAccessibility.NOT_AVAILABLE),
  lightingLevel: z.nativeEnum(LightingLevel).default(LightingLevel.BRIGHT),
  crowdLevel: z.nativeEnum(CrowdLevel).default(CrowdLevel.MODERATE),
  peakHours: z.string().optional(),
  safeVisitTime: z.string().optional(),
  weeklyPattern: z.nativeEnum(WeeklyPattern).default(WeeklyPattern.BALANCED),
  overallScore: z.number().min(0).max(5).default(3.5),
  physicalScore: z.number().min(0).max(5).default(3.5),
  safetyScore: z.number().min(0).max(5).default(3.5),
  aiSummary: z.string().optional(),
});

/**
 * Mengambil daftar lokasi (Places, Sidewalks, Transit Hubs) dengan filter aksesibilitas lengkap
 */
export async function getLocationsController(req: Request, res: Response): Promise<void> {
  try {
    const {
      entityType,
      category,
      wheelchairOnly,
      visuallyImpairedOnly,
      minScore,
      lighting,
      crowd,
      sidewalkCondition,
      search,
      sortBy = 'overallScore',
      order = 'desc',
      limit = '50',
      page = '1',
    } = req.query;

    const where: any = {};

    // Filter tipe entitas (PLACE vs SIDEWALK vs TRANSIT_HUB)
    if (entityType && typeof entityType === 'string' && Object.values(EntityType).includes(entityType as any)) {
      where.entityType = entityType as EntityType;
    }

    // Filter kategori tempat (MALL, RESTAURANT, TOURISM, dll)
    if (category && typeof category === 'string' && Object.values(PlaceCategory).includes(category as any)) {
      where.category = category as PlaceCategory;
    }

    // Filter Tunadaksa / Kursi Roda: Wajib memiliki ramp baik atau fasilitas ramah kursi roda
    if (wheelchairOnly === 'true') {
      where.rampStatus = RampStatus.GOOD;
    }

    // Filter Tunanetra: Wajib memiliki guiding block baik
    if (visuallyImpairedOnly === 'true') {
      where.guidingBlockStatus = GuidingBlockStatus.GOOD;
    }

    // Filter Skor Minimal (Rating Bintang dari AI)
    if (minScore) {
      where.overallScore = { gte: parseFloat(minScore as string) };
    }

    // Filter Pencahayaan (Keamanan malam)
    if (lighting && typeof lighting === 'string' && Object.values(LightingLevel).includes(lighting as any)) {
      where.lightingLevel = lighting as LightingLevel;
    }

    // Filter Keramaian
    if (crowd && typeof crowd === 'string' && Object.values(CrowdLevel).includes(crowd as any)) {
      where.crowdLevel = crowd as CrowdLevel;
    }

    // Filter Kondisi Trotoar
    if (sidewalkCondition && typeof sidewalkCondition === 'string' && Object.values(SidewalkCondition).includes(sidewalkCondition as any)) {
      where.sidewalkCondition = sidewalkCondition as SidewalkCondition;
    }

    // Pencarian Teks
    if (search && typeof search === 'string' && search.trim() !== '') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { specificLocation: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (Math.max(1, parseInt(page as string, 10) || 1) - 1) * take;

    const validSortFields = ['overallScore', 'physicalScore', 'safetyScore', 'priorityIndex', 'createdAt', 'name'];
    const sortField = validSortFields.includes(sortBy as string) ? (sortBy as string) : 'overallScore';
    const sortDirection = order === 'asc' ? 'asc' : 'desc';

    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        where,
        take,
        skip,
        orderBy: {
          [sortField]: sortDirection,
        },
        include: {
          _count: {
            select: {
              activities: true,
              comments: true,
            },
          },
        },
      }),
      prisma.location.count({ where }),
    ]);

    res.json({
      success: true,
      count: locations.length,
      total,
      page: parseInt(page as string, 10) || 1,
      totalPages: Math.ceil(total / take),
      data: locations,
    });
  } catch (error: any) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations', message: error.message });
  }
}

/**
 * Mengambil detail satu lokasi/trotoar lengkap beserta insight AI, parameter status, aktivitas terbaru, dan komentar
 */
export async function getLocationByIdController(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);

    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        activities: {
          where: { status: 'PUBLIC' },
          orderBy: { createdAt: 'desc' },
          take: 6,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
            _count: {
              select: { comments: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
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

    if (!location) {
      res.status(404).json({ error: 'Location not found' });
      return;
    }

    res.json({
      success: true,
      data: location,
    });
  } catch (error: any) {
    console.error('Error fetching location by id:', error);
    res.status(500).json({ error: 'Failed to fetch location details', message: error.message });
  }
}

/**
 * Membuat data lokasi / trotoar baru (Admin / Surveyor / Seeder)
 */
export async function createLocationController(req: Request, res: Response): Promise<void> {
  try {
    const validated = createLocationSchema.parse(req.body);

    const location = await prisma.location.create({
      data: {
        name: validated.name,
        entityType: validated.entityType,
        category: validated.category,
        specificLocation: validated.specificLocation || null,
        description: validated.description || null,
        coverImageUrl: validated.coverImageUrl || null,
        latitude: validated.latitude,
        longitude: validated.longitude,
        rampStatus: validated.rampStatus,
        guidingBlockStatus: validated.guidingBlockStatus,
        sidewalkCondition: validated.sidewalkCondition,
        surfaceCondition: validated.surfaceCondition,
        seatingAvailability: validated.seatingAvailability,
        toiletAccessibility: validated.toiletAccessibility,
        lightingLevel: validated.lightingLevel,
        crowdLevel: validated.crowdLevel,
        peakHours: validated.peakHours || null,
        safeVisitTime: validated.safeVisitTime || null,
        weeklyPattern: validated.weeklyPattern,
        overallScore: validated.overallScore,
        physicalScore: validated.physicalScore,
        safetyScore: validated.safetyScore,
        aiSummary: validated.aiSummary || `Lokasi ${validated.name} terdaftar dalam basis data DifaMap Makassar.`,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: location,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating location:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Memanggil PostGIS RPC Function untuk menghitung bobot ekonomi MAPID di sekitar lokasi
 */
export async function recalculateEconomicScoreController(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    const radius = Number(req.query.radius) || 500.0;

    const { data, error } = await supabase.rpc('calculate_buffer_economic_score', {
      loc_id: id,
      radius_meters: radius,
    });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Economic buffer score calculated successfully via PostGIS RPC',
      data,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'PostGIS RPC failed', message: error.message });
  }
}

/**
 * Menjalankan re-sintesis AI secara on-demand untuk lokasi tertentu
 */
export async function reSynthesizeLocationController(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id);
    await synthesizeLocationInsightsWithAI(id);

    const updated = await prisma.location.findUnique({ where: { id } });

    res.json({
      success: true,
      message: 'Location insights re-synthesized by AI successfully',
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Re-synthesis failed', message: error.message });
  }
}

