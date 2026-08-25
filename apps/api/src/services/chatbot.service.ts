import { openai } from '../lib/openai.js';
import { prisma } from '../lib/prisma.js';

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

  // Cari lokasi-lokasi relevan di Makassar
  spatialContextData = await prisma.location.findMany({
    take: 10,
    orderBy: [
      { overallScore: 'desc' },
      { totalActivities: 'desc' },
    ],
    select: {
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
    },
  });

  const systemPrompt = `
Anda adalah **DifaMap AI Assistant**, asisten cerdas khusus aksesibilitas disabilitas dan navigasi ramah inklusi di Kota Makassar (didukung oleh platform WebGIS DifaMap).

Tugas & Batasan Utama:
1. **Fokus Eksklusif**: Anda HANYA melayani pertanyaan seputar aksesibilitas disabilitas (pengguna kursi roda/tunadaksa, tunanetra, low vision, lansia), kondisi trotoar, ramp, ubin pengarah (guiding block), toilet disabilitas, pencahayaan jalan, waktu kunjungan aman, rute transit massal, dan fitur peta DifaMap di Kota Makassar.
2. **Batasi Pertanyaan di Luar Konteks**: Jika pengguna bertanya hal di luar topik aksesibilitas, infrastruktur, atau transportasi publik (misalnya tentang coding umum, gosip, resep masakan, politik umum, matematika murni), tolak dengan sopan dan arahkan kembali untuk bertanya seputar fasilitas aksesibel di DifaMap Makassar.
3. **Gunakan Data Nyata DifaMap**: Gunakan informasi lokasi dan kondisi riil yang disediakan di bawah untuk menjawab dengan akurat, spesifik, dan memberikan rekomendasi praktis (seperti waktu aman berkunjung, ketersediaan ramp, kondisi trotoar).

---
DATA KONTEKS SPASIAL DIFAMAP:
${selectedLocationData ? `[LOKASI YANG SEDANG DILIHAT PENGGUNA]\n${JSON.stringify(selectedLocationData, null, 2)}\n` : ''}
${userLocation ? `[KOORDINAT PENGGUNA]: Latitude ${userLocation.latitude}, Longitude ${userLocation.longitude}\n` : ''}
[DAFTAR TEMPAT & TROTOAR TERDAFTAR DI MAKASSAR]:
${JSON.stringify(spatialContextData, null, 2)}
---

Gaya Jawaban:
- Gunakan bahasa Indonesia yang ramah, jelas, empati, dan terstruktur (gunakan bullet points jika menjelaskan opsi).
- Sertakan estimasi kelayakan bagi disabilitas terkait (kursi roda/tunanetra).
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

    const reply = response.choices[0]?.message?.content || 'Maaf, saya sedang tidak dapat merespon saat ini. Silakan coba sesaat lagi.';

    // Lokasi yang relevan untuk dikirimkan sebagai metadata rekomendasi kartu ke UI
    const referencedLocations = spatialContextData.slice(0, 3).map((loc) => ({
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
