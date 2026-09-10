import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { EconomicType } from '@prisma/client';

/**
 * Mengambil daftar titik ekonomi (Menu Go & Properti Go)
 */
export async function getEconomicPointsController(req: Request, res: Response): Promise<void> {
  try {
    const { type, limit } = req.query;
    const where: any = {};

    if (type && typeof type === 'string' && type !== 'ALL' && Object.values(EconomicType).includes(type as any)) {
      where.type = type as EconomicType;
    }

    const takeNumber = Math.min(500, Math.max(1, parseInt(limit as string, 10) || 100));

    const points = await prisma.economicPoint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: takeNumber,
    });

    res.json({
      success: true,
      count: points.length,
      data: points,
    });
  } catch (error: any) {
    console.error('Error fetching economic points:', error);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
}
