import { Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AuthenticatedRequest } from './auth.middleware.js';

/**
 * Membatasi akses endpoint ke peran tertentu.
 *
 * Peran dibaca dari tabel `users` di database, bukan dari app_metadata token.
 * Alasannya: app_metadata hanya berubah saat token diterbitkan ulang, sehingga
 * pencabutan hak akses bisa tertunda sampai token lama kedaluwarsa. Tabel users
 * adalah sumber kebenaran yang sama dengan yang dipakai schema.prisma.
 *
 * Wajib dipasang SETELAH requireAuth.
 */
export function requireRole(...allowed: Role[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: 'Unauthorized: requireRole harus dipasang setelah requireAuth' });
        return;
      }

      const account = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true },
      });

      // Pengguna yang belum tersinkron ke tabel users dianggap peran terendah,
      // bukan diloloskan begitu saja.
      const role = account?.role ?? Role.USER;

      if (!allowed.includes(role)) {
        res.status(403).json({
          error: 'Forbidden',
          message: `Endpoint ini hanya untuk peran: ${allowed.join(', ')}.`,
        });
        return;
      }

      req.user.role = role;
      next();
    } catch (error: any) {
      console.error('[requireRole] Gagal memeriksa peran pengguna:', error);
      res.status(500).json({ error: 'Gagal memverifikasi peran pengguna' });
    }
  };
}
