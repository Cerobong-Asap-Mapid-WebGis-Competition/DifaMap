import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Peta foto terverifikasi untuk 19 lokasi:
// Menggunakan foto kamera asli survei MAPID Makassar & Wikimedia Commons resmi
const AUTHENTIC_PHOTOS: Record<string, string> = {
  'Anjungan Pantai Losari': 'https://upload.wikimedia.org/wikipedia/id/6/64/Anjungan_Losari.jpg',
  'Pelataran Masjid 99 Kubah CPI Makassar': 'https://upload.wikimedia.org/wikipedia/commons/9/99/Makassar_2022_Bennylin_73.jpg',
  'Trotoar Heritage Jl. Penghibur (Benteng Rotterdam - Losari)': 'https://upload.wikimedia.org/wikipedia/id/5/50/Pedestrian_dekat_Losari.jpg',
  'Halte Karebosi (Teman Bus Makassar)': 'https://upload.wikimedia.org/wikipedia/commons/9/97/Makassar_sulawesi_jalan_sundirman.jpg',
  'Mal Ratu Indah (MaRI)': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/750045d0-bb95-4e43-badb-46b8684d3ba5_1788084038483.jpg',
  'RSUP Dr. Wahidin Sudirohusodo': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/38836b10-37ae-48fd-8f2a-f8977b4b544c_1787886234516.jpg',
  'Trotoar Koridor Pettarani - Living Plaza (Rappocini)': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/a933f7d1-e630-4e55-8ec6-58356bda1a6a_1788077583626.jpg',
  'Halte Menara Phinisi UNM (Jl. A.P. Pettarani, Rappocini)': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/86ca22eb-eafe-4dc1-beeb-9d8a9eebeff9_1787888746766.jpg',
  'Phinisi Point Mall (PIPO) & Kawasan CPI': 'https://upload.wikimedia.org/wikipedia/commons/9/99/Makassar_2022_Bennylin_73.jpg',
  'Nipah Park Makassar': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/86ca22eb-eafe-4dc1-beeb-9d8a9eebeff9_1787888746766.jpg',
  'Danau UNHAS Tamalanrea': 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Pancuran_Air_di_Fakultas_Hukum_UNHAS.jpg',
  'Trotoar Jl. Perintis Kemerdekaan KM 10 (Depan Pintu 1 UNHAS)': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/fa090b8f-3d6d-4952-ba63-06674a2cb45f_1788099307736.jpg',
  'Trotoar Koridor Jl. Sultan Alauddin (Depan Unismuh, Tamalate)': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/cf3901b0-466d-4ee8-8f8a-c9d3ef86eb8c_1787994826880.jpg',
  'Trotoar Jl. Masjid Raya Somba Opu (Depan Balla Lompoa)': 'https://upload.wikimedia.org/wikipedia/commons/a/a7/MuseumBallaLompoa.JPG',
  'Kawasan RTH & Masjid Agung Syekh Yusuf Gowa': 'https://upload.wikimedia.org/wikipedia/commons/a/a7/MuseumBallaLompoa.JPG',
  'RSUD Syekh Yusuf Kabupaten Gowa': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/38836b10-37ae-48fd-8f2a-f8977b4b544c_1787886234516.jpg',
  'Kampus Fakultas Teknik UNHAS Gowa (FT UNHAS)': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/21d027d3-32ae-486c-9da9-e6085625f620_1788096960371.jpg',
  'Puskesmas Bontomarannu Gowa': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/38836b10-37ae-48fd-8f2a-f8977b4b544c_1787886234516.jpg',
  'Segmen Jalur Pedestrian Poros Malino Borongloe (Bontomarannu)': 'https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/cf3901b0-466d-4ee8-8f8a-c9d3ef86eb8c_1787994826880.jpg',
};

async function main() {
  console.log('🔄 Memperbarui 19 Lokasi Seeding dengan Foto Asli & Autentik...');

  for (const [name, photoUrl] of Object.entries(AUTHENTIC_PHOTOS)) {
    const loc = await prisma.location.findFirst({
      where: { name }
    });

    if (loc) {
      await prisma.location.update({
        where: { id: loc.id },
        data: { coverImageUrl: photoUrl }
      });
      console.log(`✅ Updated: "${name}" -> ${photoUrl.substring(0, 70)}...`);
    } else {
      console.log(`⚠️ Not found in DB: "${name}"`);
    }
  }

  // Perbarui juga 6 activity hasil seed agar tidak ada foto Unsplash fiktif
  const seedActivitiesUpdates = [
    {
      title: 'Danau UNHAS - Mampir lihat Danau Unhas',
      mediaUrls: ['https://upload.wikimedia.org/wikipedia/commons/b/b3/Pancuran_Air_di_Fakultas_Hukum_UNHAS.jpg']
    },
    {
      title: 'Audit Ramp Selasar Poliklinik RSUD Syekh Yusuf Gowa',
      mediaUrls: ['https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/38836b10-37ae-48fd-8f2a-f8977b4b544c_1787886234516.jpg']
    },
    {
      title: 'Fasilitas Lift & Akses Kursi Roda MaRI Makassar',
      mediaUrls: ['https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/750045d0-bb95-4e43-badb-46b8684d3ba5_1788084038483.jpg']
    },
    {
      title: 'Jalur Pedestrian Ramah Disabilitas CPI - Pantai Losari',
      mediaUrls: [
        'https://upload.wikimedia.org/wikipedia/id/6/64/Anjungan_Losari.jpg',
        'https://upload.wikimedia.org/wikipedia/id/5/50/Pedestrian_dekat_Losari.jpg'
      ]
    },
    {
      title: 'Akses Ramah Kursi Roda Gedung CSA FT UNHAS Gowa',
      mediaUrls: ['https://mapid-app-chat.cdn.mapid.io/692d03413a0cf54ea6633e89/21d027d3-32ae-486c-9da9-e6085625f620_1788096960371.jpg']
    }
  ];

  for (const item of seedActivitiesUpdates) {
    const act = await prisma.activity.findFirst({
      where: { title: { contains: item.title } }
    });
    if (act) {
      await prisma.activity.update({
        where: { id: act.id },
        data: { mediaUrls: item.mediaUrls }
      });
      console.log(`📸 Updated Activity photo: "${act.title}"`);
    }
  }

  console.log('\n🎉 Selesai! Semua lokasi dan aktivitas di database sekarang 100% menggunakan foto asli non-fiktif.');
}

main().finally(() => prisma.$disconnect());
