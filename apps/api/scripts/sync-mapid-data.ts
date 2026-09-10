import { PrismaClient, Role, EconomicType, ActivityStatus, EntityType, PlaceCategory } from '@prisma/client';
import crypto from 'crypto';
import {
  mapIdCompetitionService,
  prioritizeCameraPhotos,
  STUDY_AREA_POLYGON,
  MenuGoProperties,
  PropertiGoProperties,
} from '../src/services/mapidCompetition.service.js';

const prisma = new PrismaClient();

// Helper untuk mengubah string ID menjadi format UUID valid v4-compliant
function toUuid(input: string): string {
  const hash = crypto.createHash('md5').update(input).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

// User Surveyor Tim Cerobong Asap
const TEAM_USERS: Record<string, { name: string; email: string; avatar: string }> = {
  randymuflih: {
    name: 'Randy Muflih',
    email: 'randymuflih@difamap.id',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
  },
  atyas: {
    name: 'Atyas',
    email: 'atyas@difamap.id',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
  },
  amarr: {
    name: 'Amarr',
    email: 'amarr@difamap.id',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
  },
  aixii16: {
    name: 'Gracia (Aixii16)',
    email: 'aixii16@difamap.id',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  },
  andimuhammadzacky: {
    name: 'Andi Muhammad Zacky',
    email: 'zacky@difamap.id',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
  },
};

async function syncMapIdData() {
  console.log('🔄 Memulai Sinkronisasi Data dari MAPID Competition API...');

  // 1. Sinkronisasi User Tim Surveyor
  const userMap: Record<string, string> = {};
  for (const [username, profile] of Object.entries(TEAM_USERS)) {
    const userId = toUuid(`user_${username}`);
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: { name: profile.name, avatarUrl: profile.avatar },
      create: {
        id: userId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatar,
        role: Role.SURVEYOR,
      },
    });
    userMap[username] = user.id;
  }

  // Default fallback user
  const defaultUserId = userMap['randymuflih'];

  // 2. Tarik Seluruh Activities dari MAPID (Rentang kampanye survei)
  console.log('📡 Menarik Activities (Community Maps) dari server.mapid.io...');
  const { activities } = await mapIdCompetitionService.fetchActivities({
    polygon: STUDY_AREA_POLYGON,
    startDate: '2026-08-01',
    endDate: '2026-09-30',
  });

  console.log(`📥 Berhasil menarik ${activities.length} titik survei dari MAPID!`);

  let syncedActivitiesCount = 0;
  for (const act of activities) {
    const actId = toUuid(`mapid_act_${act._id}`);
    const authorUsername = act.user_name?.trim().toLowerCase() || '';
    const userId = userMap[authorUsername] || defaultUserId;

    const lng = act.geometry.coordinates[0];
    const lat = act.geometry.coordinates[1];

    const sortedMedias = prioritizeCameraPhotos(act.medias || []);
    const primaryPhoto = sortedMedias[0] || null;
    const locId = toUuid(`mapid_loc_${act._id}`);

    // Tentukan kategori & tipe entitas
    const titleLower = (act.title || '').toLowerCase();
    let entityType = EntityType.PLACE;
    let category = PlaceCategory.OTHER;

    if (titleLower.includes('halte') || titleLower.includes('shelter') || titleLower.includes('stasiun')) {
      entityType = EntityType.TRANSIT_HUB;
      category = PlaceCategory.BUS_STOP;
    } else if (titleLower.includes('trotoar') || titleLower.includes('jalan') || titleLower.includes('jl.')) {
      entityType = EntityType.SIDEWALK;
      category = PlaceCategory.PEDESTRIAN_PATH;
    } else if (titleLower.includes('mall') || titleLower.includes('plaza')) {
      category = PlaceCategory.MALL;
    } else if (
      titleLower.includes('rs') ||
      titleLower.includes('rumah sakit') ||
      titleLower.includes('klinik') ||
      titleLower.includes('puskesmas')
    ) {
      category = PlaceCategory.HEALTHCARE;
    } else if (
      titleLower.includes('unhas') ||
      titleLower.includes('kampus') ||
      titleLower.includes('sekolah') ||
      titleLower.includes('universitas')
    ) {
      category = PlaceCategory.EDUCATION;
    }

    // 1. Buat atau perbarui Tempat (Location) secara otomatis
    // Catatan: pada update, overallScore TIDAK ditimpa agar skor hasil evaluasi OpenAI tetap terjaga
    await prisma.location.upsert({
      where: { id: locId },
      update: {
        name: act.title || 'Titik Survei Aksesibilitas',
        specificLocation: act.community_name || 'Kota Makassar',
        description: act.description || 'Titik survei aksesibilitas fasilitas publik.',
        coverImageUrl: primaryPhoto,
        latitude: lat,
        longitude: lng,
        entityType,
        category,
      },
      create: {
        id: locId,
        name: act.title || 'Titik Survei Aksesibilitas',
        specificLocation: act.community_name || 'Kota Makassar',
        description: act.description || 'Titik survei aksesibilitas fasilitas publik.',
        coverImageUrl: primaryPhoto,
        latitude: lat,
        longitude: lng,
        overallScore: 0.0,
        entityType,
        category,
        totalActivities: 1,
      },
    });

    // 2. Simpan Activity dengan relasi ke Location
    await prisma.activity.upsert({
      where: { id: actId },
      update: {
        locationId: locId,
        title: act.title || 'Laporan Survei Aksesibilitas',
        description: act.description || '',
        mediaUrls: sortedMedias,
        latitude: lat,
        longitude: lng,
        updatedAt: new Date(act.created_at || Date.now()),
      },
      create: {
        id: actId,
        userId,
        locationId: locId,
        title: act.title || 'Laporan Survei Aksesibilitas',
        description: act.description || '',
        mediaUrls: sortedMedias,
        specificLocation: act.community_name || 'Kota Makassar',
        latitude: lat,
        longitude: lng,
        status: ActivityStatus.PUBLIC,
        accessibilityTags: ['Survei MAPID', authorUsername || 'Tim Cerobong Asap'],
        createdAt: new Date(act.created_at || Date.now()),
      },
    });

    syncedActivitiesCount++;
  }

  console.log(`✅ Berhasil menyinkronkan ${syncedActivitiesCount} activities & locations ke database PostgreSQL!`);

  // 2b. Periksa dan perbaiki urutan mediaUrls untuk SEMUA activity yang sudah ada di database
  console.log('🔄 Memeriksa seluruh activity di DB agar foto kamera lapangan asli berada di urutan pertama...');
  const allDbActs = await prisma.activity.findMany({
    select: { id: true, mediaUrls: true },
  });
  let reorderedCount = 0;
  for (const act of allDbActs) {
    const sorted = prioritizeCameraPhotos(act.mediaUrls);
    if (JSON.stringify(sorted) !== JSON.stringify(act.mediaUrls)) {
      await prisma.activity.update({
        where: { id: act.id },
        data: { mediaUrls: sorted },
      });
      reorderedCount++;
    }
  }
  console.log(`📸 Selesai! ${reorderedCount} activity berhasil diatur ulang urutan fotonya.`);

  // 3. Tarik Menu Go dari MAPID
  console.log('📡 Menarik data Menu Go dari server.mapid.io...');
  const menuGoRes = await mapIdCompetitionService.fetchMenuGo(STUDY_AREA_POLYGON);
  console.log(`📥 Ditemukan ${menuGoRes.features.length} titik Menu Go!`);

  for (const feat of menuGoRes.features) {
    const epId = toUuid(`mapid_menugo_${feat._id}`);
    const props = feat.properties as MenuGoProperties;
    const [lng, lat] = feat.geometry.coordinates;

    await prisma.economicPoint.upsert({
      where: { id: epId },
      update: {
        name: props.nama_tempat || 'Kuliner UMKM',
        type: EconomicType.MENU_GO,
        latitude: lat,
        longitude: lng,
        metadata: props as any,
      },
      create: {
        id: epId,
        name: props.nama_tempat || 'Kuliner UMKM',
        type: EconomicType.MENU_GO,
        weight: 1.2,
        latitude: lat,
        longitude: lng,
        metadata: props as any,
      },
    });
  }

  // 4. Tarik Properti Go dari MAPID
  console.log('📡 Menarik data Properti Go dari server.mapid.io...');
  const propGoRes = await mapIdCompetitionService.fetchPropertiGo(STUDY_AREA_POLYGON);
  console.log(`📥 Ditemukan ${propGoRes.features.length} titik Properti Go!`);

  for (const feat of propGoRes.features) {
    const epId = toUuid(`mapid_propertigo_${feat._id}`);
    const props = feat.properties as PropertiGoProperties;
    const [lng, lat] = feat.geometry.coordinates;

    await prisma.economicPoint.upsert({
      where: { id: epId },
      update: {
        name: props.alamat || props.jenis_properti || 'Titik Properti',
        type: EconomicType.PROPERTI_GO,
        latitude: lat,
        longitude: lng,
        metadata: props as any,
      },
      create: {
        id: epId,
        name: props.alamat || props.jenis_properti || 'Titik Properti',
        type: EconomicType.PROPERTI_GO,
        weight: 1.0,
        latitude: lat,
        longitude: lng,
        metadata: props as any,
      },
    });
  }

  console.log('🎉 Selesai! Seluruh data survei & missions MAPID telah tersimpan di database.');
}

syncMapIdData()
  .catch((err) => {
    console.error('❌ Error during sync:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
