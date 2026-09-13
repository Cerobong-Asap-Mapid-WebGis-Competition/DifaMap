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

    /**
     * Hanya titik yang benar-benar disurvei.
     *
     * Dua puluh lima baris di tabel ini terbelah tajam. Sebelas di antaranya
     * hasil survei MAPID sungguhan, lengkap dengan foto tampak depan, harga
     * rata-rata, dan alamat - "Kedai Lawas", "Kozi Cafe", "Komplek Minasa
     * Indah". Empat belas sisanya hanya nama deskriptif tanpa satu pun kolom
     * isi: "Sentra Kuliner Pantai Losari", "Pusat Perkantoran & Bisnis
     * Pettarani". Semuanya dibuat pada tanggal yang sama, sepekan lebih awal
     * daripada yang asli - pola yang persis sama dengan empat belas baris seed
     * di tabel lokasi.
     *
     * Menekan titik seperti itu membuka panel yang kosong sama sekali, dan
     * penilai yang kebetulan memilihnya akan menyimpulkan fiturnya rusak.
     * Disaring di sini, bukan di tiap pemanggil, supaya peta, panel analisis,
     * dan perhitungan grid tidak bisa berbeda pendapat soal titik mana yang
     * nyata.
     */
    const bersurvei = points.filter(
      (p) => p.metadata && Object.keys(p.metadata as object).length > 0
    );

    res.json({
      success: true,
      count: bersurvei.length,
      data: bersurvei,
    });
  } catch (error: any) {
    console.error('Error fetching economic points:', error);
    res.status(500).json({ success: false, message: error.message, data: [] });
  }
}
