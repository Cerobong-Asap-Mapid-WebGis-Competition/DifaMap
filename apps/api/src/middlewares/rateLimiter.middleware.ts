import rateLimit from 'express-rate-limit';

/**
 * Pembatas laju Difa AI: 120 pesan per 15 menit.
 *
 * Sebelumnya 30, dan itu terlalu ketat untuk penilaian lomba. Menguji sebuah
 * chatbot dengan sungguh-sungguh mudah menghabiskan tiga puluh pertanyaan
 * tanpa niat buruk sama sekali - pengujian internal pun hampir menyentuhnya.
 *
 * Biayanya bukan alasan untuk berhemat di sini. Satu pertanyaan memakai sekitar
 * 3.500 token masuk dan 300 keluar; dengan tarif di lib/aiUsage.ts itu sekitar
 * $0,0007 - bahkan bila jatah ini dihabiskan terus-menerus sepanjang jam,
 * biayanya masih di bawah $0,20 per jam. Yang dijaga pembatas ini adalah
 * penyalahgunaan, bukan pemakaian wajar.
 *
 * CATATAN PENTING: jatah ini BELUM benar-benar per pengunjung.
 *
 * express-rate-limit memakai `req.ip`, dan di belakang reverse proxy nilainya
 * adalah IP proxy - sama untuk semua orang - karena `trust proxy` belum diset
 * di aplikasi Express-nya. Selama itu belum diperbaiki, 120 ini adalah jatah
 * BERSAMA seluruh pengunjung, bukan jatah masing-masing. Di localhost hal ini
 * tidak terlihat karena tidak ada proxy di depannya.
 */
export const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Terlalu banyak permintaan ke asisten AI. Silakan tunggu beberapa saat.',
  },
});

// Rate limiter untuk pembuatan Activity (maksimal 20 post per 10 menit per IP)
export const activityCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Terlalu banyak aktivitas dikirim dalam waktu singkat. Silakan tunggu beberapa saat.',
  },
});
