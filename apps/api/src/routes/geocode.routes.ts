import { Router, Request, Response } from 'express';
import { cariTempat } from '../services/geocode.service.js';

const router = Router();

/**
 * GET /api/geocode?q=hotel+claro
 *
 * Mencari tempat di wilayah studi yang belum tentu ada di basis data DifaMap.
 * Dilewatkan server, bukan dipanggil langsung dari browser, karena tiga hal:
 * syarat pemakaian Nominatim menuntut identitas pemakai yang tetap, jeda antar
 * permintaan hanya bisa ditegakkan di satu tempat, dan hasilnya dapat disimpan
 * sementara untuk semua pengguna sekaligus.
 */
router.get('/', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();

  if (q.length < 3) {
    res.json({ success: true, count: 0, data: [], message: 'Ketik minimal 3 huruf' });
    return;
  }

  try {
    const data = await cariTempat(q, Number(req.query.limit) || 5);
    res.json({ success: true, count: data.length, data });
  } catch (error: any) {
    // Pencarian tempat luar adalah pelengkap, bukan tulang punggung. Bila
    // layanannya sedang tidak bisa dihubungi, pencarian data sendiri harus tetap
    // jalan - jadi kegagalannya dilaporkan sebagai daftar kosong bernada jelas,
    // bukan sebagai galat yang menjatuhkan seluruh kotak pencarian.
    console.warn('[geocode] gagal:', error.message);
    res.json({
      success: false,
      count: 0,
      data: [],
      message: 'Pencarian tempat luar sedang tidak tersedia',
    });
  }
});

export default router;
