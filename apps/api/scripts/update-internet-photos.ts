import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const publicDir = path.resolve(process.cwd(), 'apps/web/public/photos');

  console.log('🔄 Mengganti foto lokal dengan foto asli internet berkualitas tinggi...');

  // 1. Salin foto asli internet ke file utama
  const copies: [string, string][] = [
    ['nipah-exterior.jpg', 'nipah.jpg'],
    ['danau-unhas-2.jpg', 'danau-unhas.jpg'],
    ['masjid-99-kubah-real.jpg', 'masjid-99-kubah.jpg'],
    ['losari-real-3.jpg', 'losari.jpg'],
    ['mari-real.jpg', 'mari.jpg'],
    ['karebosi-sudirman.jpg', 'karebosi.jpg'],
    ['teknik-gowa-real.jpg', 'teknik-gowa.jpg'],
    ['gowa-real.jpg', 'gowa.jpg'],
  ];

  for (const [src, dest] of copies) {
    const srcPath = path.join(publicDir, src);
    const destPath = path.join(publicDir, dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      const sizeKb = (fs.statSync(destPath).size / 1024).toFixed(1);
      console.log(`✅ Updated ${dest} from ${src} (${sizeKb} KB)`);
    } else {
      console.warn(`⚠️ Source ${src} does not exist`);
    }
  }

  // 2. Update Database Location coverImageUrl
  const locationUpdates: Record<string, string> = {
    'Nipah Park Makassar': '/photos/nipah.jpg',
    'Danau UNHAS Tamalanrea': '/photos/danau-unhas.jpg',
    'Pelataran Masjid 99 Kubah CPI Makassar': '/photos/masjid-99-kubah.jpg',
    'Anjungan Pantai Losari': '/photos/losari.jpg',
    'Trotoar Heritage Jl. Penghibur (Benteng Rotterdam - Losari)': '/photos/losari.jpg',
    'Mal Ratu Indah (MaRI)': '/photos/mari.jpg',
    'Halte Karebosi (Teman Bus Makassar)': '/photos/karebosi.jpg',
    'Kampus Fakultas Teknik UNHAS Gowa (FT UNHAS)': '/photos/teknik-gowa.jpg',
    'Kawasan RTH & Masjid Agung Syekh Yusuf Gowa': '/photos/gowa.jpg',
    'Trotoar Jl. Masjid Raya Somba Opu (Depan Balla Lompoa)': '/photos/gowa.jpg',
  };

  for (const [name, photoUrl] of Object.entries(locationUpdates)) {
    const loc = await prisma.location.findFirst({ where: { name } });
    if (loc) {
      await prisma.location.update({
        where: { id: loc.id },
        data: { coverImageUrl: photoUrl },
      });
      console.log(`📍 Updated Location "${name}" -> ${photoUrl}`);
    }
  }

  // 3. Update Activity mediaUrls untuk Nipah & Danau UNHAS
  const danauActs = await prisma.activity.findMany({
    where: {
      OR: [
        { title: { contains: 'Danau UNHAS', mode: 'insensitive' } },
        { title: { contains: 'Danau Unhas', mode: 'insensitive' } },
      ],
    },
  });
  for (const act of danauActs) {
    await prisma.activity.update({
      where: { id: act.id },
      data: {
        mediaUrls: ['/photos/danau-unhas.jpg', '/photos/danau-unhas-wiki.jpg'],
      },
    });
    console.log(`📸 Updated Activity Danau UNHAS: "${act.title}"`);
  }

  const nipahActs = await prisma.activity.findMany({
    where: {
      OR: [
        { title: { contains: 'Nipah', mode: 'insensitive' } },
        { description: { contains: 'Nipah', mode: 'insensitive' } },
      ],
    },
  });
  for (const act of nipahActs) {
    await prisma.activity.update({
      where: { id: act.id },
      data: {
        mediaUrls: ['/photos/nipah.jpg', '/photos/nipah-courtyard.jpg'],
      },
    });
    console.log(`📸 Updated Activity Nipah: "${act.title}"`);
  }

  console.log('\n🎉 Selesai memperbarui foto asli internet untuk Nipah, Danau UNHAS, dan landmark lainnya!');
}

main().finally(() => prisma.$disconnect());
