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
 * Jika tidak ada token (Mode Guest/Publik), secara otomatis mengalokasikan user guest default
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data } = await supabase.auth.getUser(token);
      if (data?.user) {
        req.user = {
          id: data.user.id,
          email: data.user.email || '',
          role: data.user.app_metadata?.role || 'USER',
        };
        return next();
      }
    }
  } catch (err) {
    // Abaikan error koneksi Supabase di mode publik
  }

  // Alokasi default Public Guest Contributor agar posting laporan & ulasan tetap berjalan mulus
  req.user = {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'kontributor@difamap.id',
    role: 'USER',
  };

  next();
}

