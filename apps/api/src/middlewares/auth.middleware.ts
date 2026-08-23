import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

/**
 * Middleware untuk memverifikasi token JWT dari Supabase Auth
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Unauthorized: Invalid Supabase token' });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
      role: data.user.app_metadata?.role || 'USER',
    };

    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal auth verification error' });
  }
}
