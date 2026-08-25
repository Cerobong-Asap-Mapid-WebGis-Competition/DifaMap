import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '../../..');
const apiDir = path.resolve(__dirname, '..');

const rootPrisma = path.join(rootDir, 'node_modules/.prisma');
const rootAtPrisma = path.join(rootDir, 'node_modules/@prisma');

const apiPrisma = path.join(apiDir, 'node_modules/.prisma');
const apiAtPrisma = path.join(apiDir, 'node_modules/@prisma');

try {
  if (fs.existsSync(rootPrisma)) {
    fs.cpSync(rootPrisma, apiPrisma, { recursive: true, force: true });
    console.log('✅ Synced .prisma to apps/api/node_modules/.prisma');
  }
  if (fs.existsSync(rootAtPrisma)) {
    fs.cpSync(rootAtPrisma, apiAtPrisma, { recursive: true, force: true });
    console.log('✅ Synced @prisma to apps/api/node_modules/@prisma');
  }
} catch (err) {
  console.warn('⚠️ Prisma sync note:', err.message);
}
