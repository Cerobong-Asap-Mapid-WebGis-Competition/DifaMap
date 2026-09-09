import { Request, Response } from 'express';
import { z } from 'zod';
import {
  mapIdCompetitionService,
  STUDY_AREA_POLYGON,
  SearchPolygon,
  MissionType,
  SURVEY_TEAM_USERNAMES,
  SURVEY_PERIOD,
} from '../services/mapidCompetition.service.js';

/**
 * Endpoint proxy untuk MAPID Competition API.
 * Kunci API tetap di server; frontend tidak pernah menyentuhnya.
 */

const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1),
});

const activitiesSchema = z
  .object({
    // Bila polygon tidak dikirim, pakai area studi Makassar & Gowa.
    feature: polygonSchema.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD').optional(),
    hashtag: z.array(z.string()).optional(),
    author: z.string().optional(),
  })
  .refine((v) => Boolean(v.startDate) === Boolean(v.endDate), {
    message: 'startDate dan endDate harus dikirim berpasangan',
  });

const missionSchema = z.object({
  feature: polygonSchema.optional(),
});

/**
 * POST /api/mapid/competition/activities
 * Menarik Community Maps (data survei aksesibilitas) dalam sebuah polygon.
 */
export async function getCompetitionActivitiesController(req: Request, res: Response): Promise<void> {
  try {
    const validated = activitiesSchema.parse(req.body ?? {});
    const polygon = (validated.feature as SearchPolygon | undefined) ?? STUDY_AREA_POLYGON;

    const result = await mapIdCompetitionService.fetchActivities({
      polygon,
      startDate: validated.startDate,
      endDate: validated.endDate,
      hashtag: validated.hashtag,
      author: validated.author,
    });

    res.json({
      success: true,
      count: result.activities.length,
      total: result.total,
      // Diteruskan apa adanya: tanpa rentang tanggal MAPID memotong di 60 record
      // tanpa memberi tanda, jadi pemanggil harus tahu hasilnya mungkin sebagian.
      truncated: result.truncated,
      warning: result.truncated
        ? 'Hasil kemungkinan terpotong di 60 record. Kirim startDate & endDate untuk menarik seluruh data.'
        : undefined,
      data: result.activities,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(502).json({ error: 'MAPID Competition API - Activities gagal', message: error.message });
  }
}

/**
 * POST /api/mapid/competition/survey
 * Data survei RESMI DifaMap: rentang kampanye + area studi, disaring ke
 * anggota tim saja. Inilah sumber yang akan dipakai importer nanti.
 */
export async function getSurveyActivitiesController(req: Request, res: Response): Promise<void> {
  try {
    const validated = missionSchema.parse(req.body ?? {});
    const polygon = validated.feature as SearchPolygon | undefined;

    const result = await mapIdCompetitionService.fetchSurveyActivities(
      polygon ? { polygon } : {}
    );

    res.json({
      success: true,
      period: SURVEY_PERIOD,
      teamUsernames: SURVEY_TEAM_USERNAMES,
      count: result.activities.length,
      // Jumlah titik yang ikut tertarik tapi bukan tulisan anggota tim.
      // Ditampilkan supaya penyaringan tidak terjadi diam-diam.
      excludedCount: result.excludedCount,
      truncated: result.truncated,
      data: result.activities,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(502).json({ error: 'MAPID Competition API - Survey gagal', message: error.message });
  }
}

/**
 * POST /api/mapid/competition/missions/:missionType
 * missionType: menugo | propertigo | struckgo
 * Menelusuri seluruh halaman offset sampai data habis.
 */
export async function getCompetitionMissionsController(req: Request, res: Response): Promise<void> {
  const allowed: MissionType[] = ['menugo', 'propertigo', 'struckgo'];

  try {
    const missionType = String(req.params.missionType) as MissionType;
    if (!allowed.includes(missionType)) {
      res.status(400).json({
        error: `missionType tidak dikenal: '${missionType}'`,
        allowed,
      });
      return;
    }

    const validated = missionSchema.parse(req.body ?? {});
    const polygon = (validated.feature as SearchPolygon | undefined) ?? STUDY_AREA_POLYGON;

    const result = await mapIdCompetitionService.fetchAllMissions(missionType, polygon);

    res.json({
      success: true,
      missionType,
      count: result.features.length,
      total: result.total,
      complete: result.complete,
      data: result.features,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(502).json({ error: 'MAPID Competition API - Missions gagal', message: error.message });
  }
}
