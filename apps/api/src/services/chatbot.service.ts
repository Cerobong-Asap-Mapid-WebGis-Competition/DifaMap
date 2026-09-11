import { openai } from '../lib/openai.js';
import { prisma } from '../lib/prisma.js';
import { susunKonteks, type KonteksDifaAI } from './chatbotContext.js';
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
  /**
   * Jalur rute untuk digambar di peta, bila pertanyaannya berbentuk perjalanan.
   * Bentuknya mengikuti konteks supaya daftar jalur alternatif beserta
   * penilaiannya tidak perlu dituliskan ulang di dua tempat.
   */
  rute?: KonteksDifaAI['ruteDigambar'];
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
 * Difa AI - asisten aksesibilitas DifaMap dengan konteks spasial (RAG)
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

  // Konteks disusun dari pertanyaannya, bukan dari dua puluh skor tertinggi.
  // Lihat chatbotContext.ts untuk alasan lengkapnya beserta hasil pengujian yang
  // menunjukkan kegagalan cara lama.
  const konteks = await susunKonteks(message, userLocation);

  const systemPrompt = `
Anda adalah **Difa AI**, asisten DifaMap untuk aksesibilitas penyandang disabilitas di **Kota Makassar dan Kabupaten Gowa** (7 kecamatan: Tamalate, Tamalanrea, Mariso, Ujung Pandang, Rappocini, Somba Opu, Bontomarannu).

## ATURAN YANG TIDAK BOLEH DILANGGAR

1. **Hanya gunakan data di bawah ini.** Jangan pernah menyebut kondisi ramp, ubin pemandu, trotoar, toilet, atau penerangan yang tidak tertulis di data. Anda tidak punya pengetahuan lain tentang Makassar selain yang diberikan di sini.

2. **"Belum teramati" bukan "tidak ada".** Bila sebuah parameter tertulis "belum teramati", artinya tidak terlihat di foto survei - BUKAN berarti fasilitasnya tidak ada. Katakan apa adanya: "belum terdata". Jangan disimpulkan menjadi ada maupun tidak ada.

3. **Bila tidak ada datanya, katakan.** Jika tempat yang ditanyakan tidak ada di daftar, jawab terus terang bahwa DifaMap belum pernah mensurvei di sana, lalu tawarkan titik terdekat yang ADA datanya. Jangan menambal dengan tempat lain seolah itu jawabannya.

4. **Sebut dasar jawaban Anda.** Selalu sertakan nama titik survei dan skornya saat memberi penilaian, supaya pengguna bisa menelusuri sendiri.

5. **Bila ada foto dilampirkan, jelaskan apa yang Anda lihat sendiri di sana** - dan bedakan dengan jelas mana yang berasal dari foto dan mana dari parameter tercatat. Foto boleh mengungkap hambatan yang belum tercatat, misalnya kendaraan parkir di atas jalur pemandu.

6. **Untuk pertanyaan perjalanan**, jawab sebagai rantai: sebutkan hambatan berurutan dari titik awal ke tujuan, tunjukkan bagian terburuknya, dan katakan terus terang bila ada ruas panjang yang belum disurvei. Satu trotoar terputus di tengah membuat tujuan yang bagus tetap tak tercapai.

7. **Fokus aksesibilitas.** Tolak dengan sopan pertanyaan di luar topik aksesibilitas, trotoar, transit, dan fitur peta DifaMap.

## GAYA

Bahasa Indonesia yang ramah dan ringkas. Langsung ke jawabannya di kalimat pertama - misalnya "Kurang ramah" atau "Cukup ramah" - baru alasannya. Pakai butir bila membandingkan beberapa tempat. Sebutkan bila penilaian hanya bersandar pada sedikit pengamatan.

---
## RINGKASAN SELURUH DATA SURVEI DIFAMAP
${konteks.ringkasan}

## SEBERAPA LUAS WILAYAH YANG SUDAH DISURVEI
${konteks.cakupan}

${konteks.koridor ? `## HAMBATAN SEPANJANG PERJALANAN YANG DITANYAKAN\n${konteks.koridor}\n` : ''}
## TITIK SURVEI YANG PALING COCOK DENGAN PERTANYAAN INI
${konteks.rincianRelevan}

## SELURUH TITIK SURVEI (ringkas)
${konteks.daftarPadat}
${selectedLocationData ? `\n## TITIK YANG SEDANG DIBUKA PENGGUNA DI PETA\n${JSON.stringify(selectedLocationData, null, 2)}` : ''}
${userLocation ? `\n## POSISI PENGGUNA\nLatitude ${userLocation.latitude}, Longitude ${userLocation.longitude}` : ''}
---
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
  // Pertanyaan pengguna, dilampiri foto lapangan bila pertanyaannya memang
  // menuntut melihat. Difa AI sebelumnya hanya membaca ringkasan orang lain
  // tentang sebuah foto; kini ia bisa menjawab dari fotonya sendiri.
  if (konteks.fotoUntukDilihat.length > 0) {
    conversationMessages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            `${message}\n\n[Foto lapangan di "${konteks.fotoUntukDilihat[0].nama}" dilampirkan. ` +
            `Jelaskan apa yang benar-benar terlihat di foto, dan sebut bila ada hambatan yang tidak tercatat di parameter.]`,
        },
        ...konteks.fotoUntukDilihat.map((f) => ({
          type: 'image_url' as const,
          // detail "low" menekan biaya; untuk menilai ada-tidaknya ramp,
          // terhalang-tidaknya trotoar, ketajaman penuh tidak diperlukan.
          image_url: { url: f.url, detail: 'low' as const },
        })),
      ] as any,
    });
  } else {
    conversationMessages.push({
      role: 'user',
      content: message,
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversationMessages,
      temperature: 0.3,
      // 900, bukan 600: jawaban yang menyebut dasar penilaian - nama titik dan
      // skornya - memerlukan ruang lebih. Jawaban terpotong di tengah kalimat
      // jauh lebih merugikan daripada selisih biayanya, yang di bawah satu sen.
      max_tokens: 900,
    });

    // Konteks chatbot kini memuat seluruh 94 titik survei, jadi satu pertanyaan
    // memakai ribuan token masuk - jauh lebih besar daripada penilaian foto.
    // Tanpa pencatatan, pemakaian terbesar justru yang paling tidak terlihat.
    catatPemakaian('difa-ai-chat', response.usage);

    const reply = response.choices[0]?.message?.content || 'Maaf, saya sedang tidak dapat merespon saat ini. Silakan coba sesaat lagi.';

    // Kartu rekomendasi mengikuti titik yang benar-benar dipakai menjawab.
    // Sebelumnya diambil tiga teratas menurut skor - tidak berhubungan dengan
    // pertanyaannya, dan seringkali justru data seed karangan.
    const referencedLocations = konteks.namaRelevan.length
      ? await prisma.location.findMany({
          where: { name: { in: konteks.namaRelevan.slice(0, 3) } },
          select: {
            id: true,
            name: true,
            entityType: true,
            category: true,
            overallScore: true,
            rampStatus: true,
            guidingBlockStatus: true,
            safeVisitTime: true,
          },
        })
      : [];

    return {
      reply,
      referencedLocations,
      rute: konteks.ruteDigambar,
    };
  } catch (error: any) {
    console.error('Error during DifaMap chatbot response generation:', error);
    return {
      reply: 'Halo! Saya Difa AI. Saat ini ada sedikit gangguan koneksi ke server AI, namun Anda tetap dapat menjelajahi peta interaktif, kondisi ramp, trotoar, dan aktivitas ramah disabilitas langsung pada map.',
    };
  }
}
