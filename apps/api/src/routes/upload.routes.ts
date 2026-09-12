/**
 * Unggah foto laporan lapangan.
 *
 *
 * KENAPA BUKAN MULTIPART
 *
 * Menerima berkas lewat multipart/form-data menuntut pustaka tambahan seperti
 * multer, dan menambah dependensi berarti setiap anggota tim harus memasang
 * ulang sebelum bisa menjalankan servernya. Untuk satu berkas sekali unggah,
 * badan mentah sudah cukup: peramban mengirimkan berkasnya apa adanya dengan
 * Content-Type gambar, dan express.raw yang sudah ada di Express membacanya.
 *
 *
 * KENAPA HARUS ADA
 *
 * Kolom foto sebelumnya meminta URL yang ditempel sendiri. Pelapor di lapangan
 * memegang foto di galeri ponselnya, bukan tautan - untuk mengisi kolom itu ia
 * harus mengunggah fotonya dulu ke layanan lain, menyalin tautannya, lalu
 * kembali. Praktis tidak ada yang melakukannya, dan laporan pun datang tanpa
 * foto - padahal fotolah yang membuat penilaian Difa AI jauh lebih kuat.
 */

import { Router, type Request, type Response } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { supabase } from '../lib/supabase.js';
import { env } from '../config/env.js';

const router = Router();

const BUCKET = 'laporan-foto';
const BATAS_BYTE = 5 * 1024 * 1024;

const JENIS_DIIZINKAN: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

router.post(
  '/foto',
  express.raw({ type: Object.keys(JENIS_DIIZINKAN), limit: BATAS_BYTE }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const jenis = String(req.headers['content-type'] ?? '').split(';')[0].trim();
      const akhiran = JENIS_DIIZINKAN[jenis];

      if (!akhiran) {
        res.status(415).json({
          error: 'Jenis berkas tidak didukung. Kirim JPG, PNG, atau WebP.',
        });
        return;
      }

      const isi = req.body as Buffer;

      if (!Buffer.isBuffer(isi) || isi.length === 0) {
        res.status(400).json({ error: 'Berkas kosong atau gagal terbaca.' });
        return;
      }

      // Nama berkas tidak pernah berasal dari pengguna: nama kiriman bisa
      // memuat garis miring atau titik ganda yang menyeret berkas keluar dari
      // foldernya. Nama acak juga menghindari dua laporan bernama sama saling
      // menimpa.
      const nama = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${akhiran}`;

      /**
       * Dicoba sampai tiga kali.
       *
       * Bukan menutupi kesalahan kode: pengujian di sini menemukan unggahan
       * gagal dengan "fetch failed" tiga kali berturut-turut lalu berhasil pada
       * percobaan keempat, sementara permintaan lain ke tuan rumah yang sama
       * berjalan mulus. Gangguan sesaat semacam itu tidak boleh berakhir dengan
       * hilangnya foto pelapor - ia sudah memilih berkasnya, dan menyuruhnya
       * mengulang dari awal adalah cara tercepat kehilangan laporan itu.
       */
      let galat: { message: string } | null = null;

      for (let percobaan = 1; percobaan <= 3; percobaan++) {
        const { error } = await supabase.storage.from(BUCKET).upload(nama, isi, {
          contentType: jenis,
          cacheControl: '31536000',
          upsert: false,
        });

        if (!error) {
          galat = null;
          break;
        }

        galat = error;
        console.warn(`[unggah] percobaan ${percobaan} gagal: ${error.message}`);

        if (percobaan < 3) await new Promise((r) => setTimeout(r, 400 * percobaan));
      }

      if (galat) {
        console.error('[unggah] gagal menyimpan ke Supabase Storage:', galat.message);
        res.status(502).json({ error: 'Foto gagal disimpan.', message: galat.message });
        return;
      }

      const url = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${nama}`;

      res.status(201).json({ success: true, data: { url } });
    } catch (err: any) {
      // Badan yang melampaui batas ditolak express.raw sebelum sampai ke sini,
      // tetapi pesannya tidak menyebut ukuran - jadi disebutkan di sini.
      const terlaluBesar = /entity too large/i.test(err?.message ?? '');

      res.status(terlaluBesar ? 413 : 500).json({
        error: terlaluBesar
          ? 'Foto terlalu besar. Batasnya 5 MB.'
          : 'Gagal mengunggah foto.',
        message: err?.message,
      });
    }
  }
);

export default router;
