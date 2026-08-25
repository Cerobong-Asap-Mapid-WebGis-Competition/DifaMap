import rateLimit from 'express-rate-limit';

// Rate limiter untuk Chatbot AI (maksimal 30 pesan per 15 menit per IP)
export const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
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
