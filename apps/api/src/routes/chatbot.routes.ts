import { Router } from 'express';
import { chatWithAiController } from '../controllers/chatbot.controller.js';
import { chatbotLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

// Endpoint Chatbot AI dengan Konteks Spasial Aksesibilitas & Rate Limiter
router.post('/message', chatbotLimiter, chatWithAiController);

export default router;

