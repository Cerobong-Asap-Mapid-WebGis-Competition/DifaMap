import { Request, Response } from 'express';
import { z } from 'zod';
import { handleAccessibilityChat } from '../services/chatbot.service.js';

const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  userLocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  selectedLocationId: z.string().uuid().optional(),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).optional(),
});

/**
 * Controller untuk interaksi dengan DifaMap AI Accessibility Assistant
 */
export async function chatWithAiController(req: Request, res: Response): Promise<void> {
  try {
    const validated = chatRequestSchema.parse(req.body);

    const result = await handleAccessibilityChat({
      message: validated.message,
      userLocation: validated.userLocation,
      selectedLocationId: validated.selectedLocationId,
      history: validated.history,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Error in chatbot controller:', error);
    res.status(500).json({ error: 'Internal chatbot service error', message: error.message });
  }
}
