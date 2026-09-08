import { openai } from '../lib/openai.js';
import { prisma } from '../lib/prisma.js';
import { catatPemakaian } from '../lib/aiUsage.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  message: string;
  userLocation?: {
    latitude: number;
    longitude: number;
  };
  selectedLocationId?: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  referencedLocations?: Array<{
    id: string;
    name: string;
    entityType: string;
    category: string;
    overallScore: number;
    rampStatus: string;
    guidingBlockStatus: string;
    safeVisitTime?: string | null;
  }>;
}

/**
 * Chatbot Asisten Aksesibilitas DifaMap dengan Konteks Spasial (RAG)
 * Terkoneksi dengan data database lokasi & aktivitas sekitar Kota Makassar.
 */
export async function handleAccessibilityChat(input: ChatInput): Promise<ChatResponse> {
  const { message, userLocation, selectedLocationId, history = [] } = input;

  // 1. Ambil data spasial relevan dari database untuk dimasukkan ke konteks prompt
  let spatialContextData: any[] = [];
  let selectedLocationData: any = null;

  if (selectedLocationId) {
    selectedLocationData = await prisma.location.findUnique({
      where: { id: selectedLocationId },
      include: {
        activities: {
          where: { status: 'PUBLIC' },
          take: 5,
          select: {
            title: true,
            description: true,
            aiScore: true,
            observedParameters: true,
            createdAt: true,
          },
        },
      },
    });
  }

  // Pengambilan konteks (retrieval).
  //
  // Sebelumnya konteks selalu diisi 20 lokasi berskor TERTINGGI, apa pun
  // pertanyaannya. Akibatnya pertanyaan seperti "titik mana yang paling butuh
  // perbaikan?" justru dijawab dengan daftar tempat terbaik — kebalikan dari
  // yang ditanyakan. Koordinat pengguna pun diabaikan.
  //
  // Sekarang: bila koordinat pengguna ada, ambil yang TERDEKAT lewat PostGIS;
  // bila tidak, ambil yang paling mendesak menurut priorityIndex.
  const selectFields = {
      id: true,
      name: true,
      entityType: true,
      category: true,
      specificLocation: true,
      latitude: true,
      longitude: true,
      overallScore: true,
      physicalScore: true,
      safetyScore: true,
      rampStatus: true,
      guidingBlockStatus: true,
      sidewalkCondition: true,
      surfaceCondition: true,
      seatingAvailability: true,
      toiletAccessibility: true,
      lightingLevel: true,
      crowdLevel: true,
      peakHours: true,
      safeVisitTime: true,
      weeklyPattern: true,
      aiSummary: true,
  } as const;

  if (userLocation) {
    // Radius 3km dari posisi pengguna, diurutkan dari yang terdekat.
    // Memakai kolom geom yang terindeks GIST, bukan menghitung ulang per baris.
    spatialContextData = await prisma.$queryRaw`
      SELECT
        id, name, entity_type as "entityType", category,
        specific_location as "specificLocation", latitude, longitude,
        overall_score as "overallScore", physical_score as "physicalScore",
        safety_score as "safetyScore", priority_index as "priorityIndex",
        ramp_status as "rampStatus", guiding_block_status as "guidingBlockStatus",
        sidewalk_condition as "sidewalkCondition", surface_condition as "surfaceCondition",
        seating_availability as "seatingAvailability", toilet_accessibility as "toiletAccessibility",
        lighting_level as "lightingLevel", crowd_level as "crowdLevel",
        peak_hours as "peakHours", safe_visit_time as "safeVisitTime",
        weekly_pattern as "weeklyPattern", ai_summary as "aiSummary",
        ROUND(ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${userLocation.longitude}, ${userLocation.latitude}), 4326)::geography
        )) as "distanceMeters"
      FROM public.locations
      WHERE geom IS NOT NULL
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${userLocation.longitude}, ${userLocation.latitude}), 4326)::geography,
          3000
        )
      ORDER BY "distanceMeters" ASC
      LIMIT 20
    `;
  } else {
    // Tanpa koordinat: prioritaskan titik yang paling butuh perbaikan,
    // karena itu pertanyaan yang paling sering diajukan Mode Urban Planner.
    spatialContextData = await prisma.location.findMany({
      take: 20,
      orderBy: [{ priorityIndex: 'desc' }, { totalActivities: 'desc' }],
      select: { ...selectFields, priorityIndex: true },
    });
  }

  const systemPrompt = `
Anda adalah **DifaMap AI Assistant**, asisten cerdas khusus aksesibilitas disabilitas dan navigasi ramah inklusi untuk wilayah **Kota Makassar dan Kabupaten Gowa** (mencakup 7 zona kecamatan: Tamalate, Tamalanrea, Mariso, Ujung Pandang, Rappocini, Somba Opu, dan Bontomarannu).

Tugas & Batasan Utama:
1. **Fokus Eksklusif**: Anda HANYA melayani pertanyaan seputar aksesibilitas disabilitas (pengguna kursi roda/tunadaksa, tunanetra, low vision, lansia), kondisi trotoar, ramp, ubin pengarah (guiding block), toilet disabilitas, pencahayaan jalan, waktu kunjungan aman, rute transit massal, dan fitur peta DifaMap di Kota Makassar dan Kabupaten Gowa.
2. **Batasi Pertanyaan di Luar Konteks**: Jika pengguna bertanya hal di luar topik aksesibilitas, infrastruktur, atau transportasi publik (misalnya tentang coding umum, gosip, resep masakan, politik umum, matematika murni), tolak dengan sopan dan arahkan kembali untuk bertanya seputar fasilitas aksesibel di DifaMap Makassar & Gowa.
3. **Gunakan Data Nyata DifaMap**: Gunakan informasi lokasi dan kondisi riil yang disediakan di bawah untuk menjawab dengan akurat, spesifik, dan memberikan rekomendasi praktis (seperti waktu aman berkunjung, ketersediaan ramp, kondisi trotoar).

---
DATA KONTEKS SPASIAL DIFAMAP:
${selectedLocationData ? `[LOKASI YANG SEDANG DILIHAT PENGGUNA]\n${JSON.stringify(selectedLocationData, null, 2)}\n` : ''}
${userLocation ? `[KOORDINAT PENGGUNA]: Latitude ${userLocation.latitude}, Longitude ${userLocation.longitude}\n` : ''}
[DAFTAR TEMPAT & TROTOAR TERDAFTAR DI MAKASSAR & GOWA (7 ZONA KECAMATAN)]:
${JSON.stringify(spatialContextData, null, 2)}
---

Gaya Jawaban:
- Gunakan bahasa Indonesia yang ramah, jelas, empati, dan terstruktur (gunakan bullet points jika menjelaskan opsi).
- Sertakan estimasi kelayakan bagi disabilitas terkait (kursi roda/tunanetra).
- **Sebut nama lokasi PERSIS seperti tertulis pada data di atas**, jangan disingkat
  atau diparafrase. Nama itu dipakai sistem untuk menandai sumber data yang Anda
  rujuk, sehingga pengguna bisa memeriksa sendiri dasar jawaban Anda.
- Jangan menyebut lokasi yang tidak ada dalam data di atas. Bila data yang
  tersedia tidak cukup untuk menjawab, katakan terus terang.
`;

  const conversationMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Tambahkan riwayat percakapan sebelumnya (maksimal 6 pesan terakhir)
  for (const h of history.slice(-6)) {
    conversationMessages.push({
      role: h.role,
      content: h.content,
    });
  }

  // Tambahkan pertanyaan user terkini
  conversationMessages.push({
    role: 'user',
    content: message,
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversationMessages,
      temperature: 0.3,
      max_tokens: 600,
    });

    catatPemakaian('chatbot', response.usage);

    const reply = response.choices[0]?.message?.content || 'Maaf, saya sedang tidak dapat merespon saat ini. Silakan coba sesaat lagi.';

    // Sumber data yang BENAR-BENAR dirujuk jawaban, bukan tiga teratas konteks.
    //
    // Sebelumnya kolom ini diisi 3 lokasi pertama dari konteks apa pun isi
    // jawabannya, jadi "sumber" yang ditampilkan ke pengguna belum tentu ada
    // hubungannya dengan yang dibaca AI. DEVELOPMENT.md Bab 8 mensyaratkan
    // sumber yang mendasari insight ditampilkan — kalau sumbernya dikarang,
    // syarat itu justru dilanggar sambil terlihat dipenuhi.
    //
    // Sekarang: hanya lokasi yang namanya benar-benar disebut dalam jawaban.
    // Kalau AI tidak menyebut satu pun, daftarnya kosong — itu jawaban jujur.
    const replyLower = reply.toLowerCase();
    const referencedLocations = spatialContextData
      .filter((loc) => typeof loc.name === 'string' && replyLower.includes(loc.name.toLowerCase()))
      .slice(0, 5)
      .map((loc) => ({
        id: loc.id,
        name: loc.name,
        entityType: loc.entityType,
        category: loc.category,
        overallScore: loc.overallScore,
        rampStatus: loc.rampStatus,
        guidingBlockStatus: loc.guidingBlockStatus,
        safeVisitTime: loc.safeVisitTime,
      }));

    return {
      reply,
      referencedLocations,
    };
  } catch (error: any) {
    console.error('Error during DifaMap chatbot response generation:', error);
    return {
      reply: 'Halo! Saya DifaMap AI Assistant. Saat ini ada sedikit gangguan koneksi ke server AI, namun Anda tetap dapat menjelajahi peta interaktif, kondisi ramp, trotoar, dan aktivitas ramah disabilitas langsung pada map.',
    };
  }
}
