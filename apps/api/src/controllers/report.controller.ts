import { Request, Response } from 'express';
import { z } from 'zod';
import { createCommunityReportWithAI } from '../services/aiOrchestrator.service.js';
import { prisma } from '../lib/prisma.js';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

const createReportSchema = z.object({
  locationId: z.string().uuid('Invalid locationId UUID'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  userScore: z.number().min(1).max(5),
  photoUrl: z.string().url().optional(),
});

export async function createReportController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const validated = createReportSchema.parse(req.body);
    const userId = req.user?.id || req.body.userId;

    if (!userId) {
      res.status(401).json({ error: 'User must be authenticated to submit a report' });
      return;
    }

    // Panggil AI Orchestrator Service
    const report = await createCommunityReportWithAI({
      userId,
      locationId: validated.locationId,
      description: validated.description,
      userScore: validated.userScore,
      photoUrl: validated.photoUrl,
    });

    res.status(201).json({
      success: true,
      message: 'Report created and analyzed by AI successfully',
      data: report,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error creating report:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

export async function getLocationsController(_req: Request, res: Response): Promise<void> {
  try {
    const locations = await prisma.location.findMany({
      orderBy: {
        priorityIndex: 'desc', // Titik dengan prioritas perbaikan tertinggi di atas
      },
      include: {
        _count: {
          select: { reports: true },
        },
      },
    });

    res.json({
      success: true,
      count: locations.length,
      data: locations,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch locations', message: error.message });
  }
}

export async function recalculateEconomicScoreController(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const radius = Number(req.query.radius) || 500.0;

    // Memanggil Supabase PostGIS RPC Function
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
