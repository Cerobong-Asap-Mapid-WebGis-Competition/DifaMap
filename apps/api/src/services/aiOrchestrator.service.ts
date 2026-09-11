import { openai } from '../lib/openai.js';
import { prisma } from '../lib/prisma.js';
import { catatPemakaian } from '../lib/aiUsage.js';
import {
  RampStatus,
  GuidingBlockStatus,
  SidewalkCondition,
  SurfaceCondition,
  SeatingAvailability,
  ToiletAccessibility,
  LightingLevel,
  CrowdLevel,
} from '@prisma/client';

export interface AIAnalysisOutput {
  overallScore: number; // 1.0 - 5.0 (Rating Bintang)
  physicalScore: number; // 1.0 - 5.0
  safetyScore: number; // 1.0 - 5.0
  aiConfidence: number; // 0.0 - 1.0 (Keyakinan AI berdasarkan bukti visual & teks)
  tags: string[];
  summary: string;
  barrierType: string;
  actionRecommendation: string;
  observedParameters: {
    rampStatus: RampStatus;
    guidingBlockStatus: GuidingBlockStatus;
    sidewalkCondition: SidewalkCondition;
    surfaceCondition: SurfaceCondition;
    seatingAvailability: SeatingAvailability;
    toiletAccessibility: ToiletAccessibility;
    lightingLevel: LightingLevel;
    crowdLevel: CrowdLevel;
  };
}

export interface AnalyzeActivityInput {
  title: string;
  description: string;
  specificLocation?: string;
  mediaUrls?: string[];
  entityTypeHint?: 'PLACE' | 'SIDEWALK' | 'TRANSIT_HUB';
  userObservedHints?: {
    /** Waktu pelapor berada di lokasi, ISO. Diteruskan apa adanya ke hasil. */
    visitedAt?: string;
    rampStatus?: RampStatus;
    guidingBlockStatus?: GuidingBlockStatus;
    sidewalkCondition?: SidewalkCondition;
    surfaceCondition?: SurfaceCondition;
    seatingAvailability?: SeatingAvailability;
    toiletAccessibility?: ToiletAccessibility;
    lightingLevel?: LightingLevel;
    crowdLevel?: CrowdLevel;
  };
}

// JSON Schema Strict Mode untuk OpenAI Structured Outputs
const ACCESSIBILITY_ANALYSIS_SCHEMA = {
  name: 'accessibility_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      overallScore: {
        type: 'number',
        description: 'Rating bintang keseluruhan 1.0 hingga 5.0 ramah disabilitas.',
      },
      physicalScore: {
        type: 'number',
        description: 'Skor aksesibilitas fisik 1.0 hingga 5.0 (ramp, guiding block, trotoar, permukaan).',
      },
      safetyScore: {
        type: 'number',
        description: 'Skor keselamatan & kenyamanan 1.0 hingga 5.0 (lampu jalan malam, keramaian, tempat duduk).',
      },
      aiConfidence: {
        type: 'number',
        description: 'Tingkat keyakinan observasi AI dari 0.0 (minim bukti/ragu) hingga 1.0 (sangat yakin/bukti foto sangat jelas).',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Label kata kunci aksesibilitas (misal: "kursi-roda", "guiding-block-tersambung", "trotoar-sempit").',
      },
      summary: {
        type: 'string',
        description: 'Ringkasan narasi 1-3 kalimat mengenai kondisi aksesibilitas titik ini dalam bahasa Indonesia.',
      },
      barrierType: {
        type: 'string',
        description: 'Rintangan utama bagi penyandang disabilitas fisik/sensorik.',
      },
      actionRecommendation: {
        type: 'string',
        description: 'Rekomendasi tindakan prioritas bagi dinas terkait / pengelola fasilitas.',
      },
      observedParameters: {
        type: 'object',
        properties: {
          rampStatus: {
            type: 'string',
            enum: ['GOOD', 'DAMAGED', 'NONE', 'NOT_VISIBLE'],
            description: 'Kondisi ramp kursi roda. Wajib NOT_VISIBLE jika tidak tampak di foto atau tidak disebutkan di teks.',
          },
          guidingBlockStatus: {
            type: 'string',
            enum: ['GOOD', 'DAMAGED', 'NONE', 'NOT_VISIBLE'],
            description: 'Kondisi ubin pemandu kuning tunanetra. Wajib NOT_VISIBLE jika tidak terlihat.',
          },
          sidewalkCondition: {
            type: 'string',
            enum: ['GOOD', 'NARROW', 'DAMAGED', 'BLOCKED', 'NOT_APPLICABLE', 'NOT_VISIBLE'],
            description: 'Kondisi jalur trotoar pejalan kaki. NOT_APPLICABLE bila lokasi di dalam gedung, NOT_VISIBLE bila tidak terpotret.',
          },
          surfaceCondition: {
            type: 'string',
            enum: ['SMOOTH', 'SLIPPERY', 'POTHOLE', 'UNEVEN', 'NOT_VISIBLE'],
            description: 'Kondisi permukaan jalan/lantai.',
          },
          seatingAvailability: {
            type: 'string',
            enum: ['AVAILABLE', 'NOT_AVAILABLE', 'NOT_VISIBLE'],
            description: 'Tempat duduk istirahat. NOT_AVAILABLE hanya bila tampak jelas tidak ada tempat duduk.',
          },
          toiletAccessibility: {
            type: 'string',
            enum: ['AVAILABLE_GOOD', 'AVAILABLE_DAMAGED', 'NOT_AVAILABLE', 'NOT_VISIBLE'],
            description: 'Toilet disabilitas. Karena umumnya di dalam bangunan, wajib NOT_VISIBLE kecuali tampak di foto atau disebut eksplisit.',
          },
          lightingLevel: {
            type: 'string',
            enum: ['BRIGHT', 'DIM', 'DARK', 'NOT_VISIBLE'],
            description: 'Ketersediaan lampu jalan malam hari — BUKAN terangnya foto siang hari! Wajib NOT_VISIBLE bila foto diambil siang hari tanpa tiang lampu penerangan jalan yang jelas.',
          },
          crowdLevel: {
            type: 'string',
            enum: ['QUIET', 'MODERATE', 'CROWDED', 'NOT_VISIBLE'],
            description: 'Pola keramaian umum lokasi — bukan jumlah orang pada satu jepretan foto semata.',
          },
        },
        required: [
          'rampStatus',
          'guidingBlockStatus',
          'sidewalkCondition',
          'surfaceCondition',
          'seatingAvailability',
          'toiletAccessibility',
          'lightingLevel',
          'crowdLevel',
        ],
        additionalProperties: false,
      },
    },
    required: [
      'overallScore',
      'physicalScore',
      'safetyScore',
      'aiConfidence',
      'tags',
      'summary',
      'barrierType',
      'actionRecommendation',
      'observedParameters',
    ],
    additionalProperties: false,
  },
};

// System Prompt dibuat statis dan konsisten untuk memanfaatkan OpenAI Prompt Caching (~50% diskon tarif masukan)
const SYSTEM_PROMPT_INSPECTOR = `Anda adalah AI Spatial & Accessibility Inspector untuk platform WebGIS DifaMap (Kompetisi WebGIS MAPID 2026).
Tugas Anda adalah menganalisis kiriman aktivitas, laporan survei lapangan, dan foto fasilitas publik di wilayah Kota Makassar & Kabupaten Gowa (7 zona: Tamalate, Tamalanrea, Mariso, Ujung Pandang, Rappocini, Bontomarannu, Somba Opu) untuk menilai aksesibilitas bagi penyandang disabilitas (kursi roda / tunadaksa, tunanetra, lansia).

ATURAN KRUSIAL PENILAIAN (CATATAN TEKNIS CEROBONG ASAP):
1. Pertanyaan Pemeriksa Sebelum Menjawab Setiap Parameter:
   "Apakah saya MELIHAT buktinya di foto atau MEMBACANYA di deskripsi surveyor? Atau saya hanya menyimpulkannya dari konteks umum? Kalau hanya menyimpulkan, WAJIB jawab NOT_VISIBLE."
2. Larangan Menurunkan Skor Karena Parameter Tidak Terlihat:
   Lokasi dengan foto terbatas BUKAN berarti lokasi tersebut buruk. JANGAN menurunkan overallScore hanya karena parameter bernilai NOT_VISIBLE. Nilai skor harus didasarkan murni pada bukti fasilitas nyata yang terlihat atau terkonfirmasi rusak/ada di foto & teks.
3. Definisi Parameter Kritis yang Rawan Menyesatkan:
   - lightingLevel: Mengukur ketersediaan lampu penerangan jalan / publik untuk keamanan malam hari — BUKAN kecerahan atau terangnya foto siang hari! Foto di siang hari tidak memberi bukti penerangan malam, sehingga bila tidak ada tiang lampu jalan aktif yang tampak jelas, jawab NOT_VISIBLE.
   - crowdLevel: Pola keramaian tempat secara umum atau menurut catatan surveyor — bukan sekadar menghitung berapa orang yang kebetulan lewat di 1 jepretan kamera.
   - seating / toilet: Toilet hampir selalu di dalam bangunan / tertutup. Jangan pilih NOT_AVAILABLE kecuali survei menyatakan tidak ada toilet atau foto memperlihatkan seluruh area terbuka tanpa toilet. Hampir selalu NOT_VISIBLE pada foto luar ruangan.
4. Nilai Keyakinan (aiConfidence 0.0 - 1.0):
   - 0.8 - 1.0: Bukti foto resolusi baik dan jelas memperlihatkan fasilitas (ramp, guiding block, trotoar).
   - 0.5 - 0.7: Foto agak jauh atau bukti didominasi oleh teks deskripsi survei.
   - 0.2 - 0.4: Foto sangat terbatas / blur / tidak memperlihatkan fasilitas terkait.
5. Panduan Skala overallScore (1.0 - 5.0 Bintang):
   - 4.5 - 5.0: Fasilitas sangat ramah disabilitas (ada ramp landai <8%, guiding block tersambung rapi, trotoar rata & lebar).
   - 3.5 - 4.4: Aksesibel cukup baik dengan catatan minor (ramp ada tapi agak curam, paving sedikit aus).
   - 2.5 - 3.4: Kurang aksesibel, membutuhkan pendamping bagi kursi roda/tunanetra (trotoar sempit/rusak, ada trap tangga kecil tanpa ramp).
   - 1.0 - 2.4: Sangat tidak ramah / berbahaya (guiding block terputus ke selokan, trotoar terblokir total oleh tiang/PKL, tangga tanpa ramp sama sekali).`;

/**
 * Menganalisis kiriman aktivitas / laporan aksesibilitas menggunakan OpenAI Structured Output (Strict Schema)
 * Menghasilkan rating bintang objektif (1.0 - 5.0), confidence, dan mengekstrak parameter fisik & keamanan.
 */
export async function analyzeAccessibilityActivity(
  input: AnalyzeActivityInput
): Promise<AIAnalysisOutput> {
  const { title, description, specificLocation, mediaUrls = [], entityTypeHint = 'PLACE', userObservedHints } = input;

  // Format teks prompt pengguna
  const textPrompt = `Nama Titik: "${title}"
Deskripsi Laporan Surveyor: "${description}"
Lokasi Spesifik: "${specificLocation || 'Tidak disebutkan'}"
Tipe Entitas: "${entityTypeHint}"
Petunjuk Observasi Pengguna: ${JSON.stringify(userObservedHints || {})}
Jumlah Foto Dilampirkan: ${mediaUrls.length}`;

  try {
    const userContent: Array<any> = [{ type: 'text', text: textPrompt }];

    // Filter URL foto yang valid (maksimal 3 foto kamera pertama dengan detail 'low' untuk efisiensi biaya)
    if (mediaUrls.length > 0) {
      for (const url of mediaUrls.slice(0, 3)) {
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          userContent.push({
            type: 'image_url',
            image_url: { url, detail: 'low' },
          });
        }
      }
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: {
        type: 'json_schema',
        json_schema: ACCESSIBILITY_ANALYSIS_SCHEMA as any,
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_INSPECTOR },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
    });

    catatPemakaian('analisis-aktivitas', response.usage);

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = JSON.parse(rawContent);

    const overallScore = Math.max(1.0, Math.min(5.0, Number(parsed.overallScore) || 3.0));
    const physicalScore = Math.max(1.0, Math.min(5.0, Number(parsed.physicalScore) || overallScore));
    const safetyScore = Math.max(1.0, Math.min(5.0, Number(parsed.safetyScore) || 3.5));
    const aiConfidence = Math.max(0.0, Math.min(1.0, Number(parsed.aiConfidence) || 0.7));

    const obs = parsed.observedParameters || {};

    return {
      overallScore: parseFloat(overallScore.toFixed(1)),
      physicalScore: parseFloat(physicalScore.toFixed(1)),
      safetyScore: parseFloat(safetyScore.toFixed(1)),
      aiConfidence: parseFloat(aiConfidence.toFixed(2)),
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['aksesibilitas-makassar'],
      summary: parsed.summary || 'Aktivitas pemetaan aksesibilitas disabilitas di Makassar.',
      barrierType: parsed.barrierType || 'Tidak ada hambatan signifikan',
      actionRecommendation: parsed.actionRecommendation || 'Pertahankan kondisi fasilitas yang sudah ramah disabilitas.',
      observedParameters: {
        rampStatus: (obs.rampStatus as RampStatus) || userObservedHints?.rampStatus || RampStatus.NOT_VISIBLE,
        guidingBlockStatus: (obs.guidingBlockStatus as GuidingBlockStatus) || userObservedHints?.guidingBlockStatus || GuidingBlockStatus.NOT_VISIBLE,
        sidewalkCondition: (obs.sidewalkCondition as SidewalkCondition) || userObservedHints?.sidewalkCondition || SidewalkCondition.NOT_VISIBLE,
        surfaceCondition: (obs.surfaceCondition as SurfaceCondition) || userObservedHints?.surfaceCondition || SurfaceCondition.NOT_VISIBLE,
        seatingAvailability: (obs.seatingAvailability as SeatingAvailability) || userObservedHints?.seatingAvailability || SeatingAvailability.NOT_VISIBLE,
        toiletAccessibility: (obs.toiletAccessibility as ToiletAccessibility) || userObservedHints?.toiletAccessibility || ToiletAccessibility.NOT_VISIBLE,
        lightingLevel: (obs.lightingLevel as LightingLevel) || userObservedHints?.lightingLevel || LightingLevel.NOT_VISIBLE,
        crowdLevel: (obs.crowdLevel as CrowdLevel) || userObservedHints?.crowdLevel || CrowdLevel.NOT_VISIBLE,
        // Waktu kunjungan diteruskan apa adanya, tidak diminta ke AI: hanya
        // pelapor yang tahu kapan ia berdiri di sana, dan menebaknya dari foto
        // adalah persis jenis karangan yang ingin dihindari.
        ...(userObservedHints?.visitedAt ? { visitedAt: userObservedHints.visitedAt } : {}),
      },
    };
  } catch (error) {
    console.error('Error in analyzeAccessibilityActivity AI orchestrator:', error);
    // Fallback cerdas heuristik jika API limit/timeout
    return {
      overallScore: 3.0,
      physicalScore: 3.0,
      safetyScore: 3.0,
      aiConfidence: 0.3,
      tags: ['laporan-komunitas', 'makassar'],
      summary: description || title,
      barrierType: 'Perlu verifikasi lanjutan',
      actionRecommendation: 'Jadwalkan survei validasi fasilitas aksesibilitas.',
      observedParameters: {
        rampStatus: userObservedHints?.rampStatus || RampStatus.NOT_VISIBLE,
        guidingBlockStatus: userObservedHints?.guidingBlockStatus || GuidingBlockStatus.NOT_VISIBLE,
        sidewalkCondition: userObservedHints?.sidewalkCondition || SidewalkCondition.NOT_VISIBLE,
        surfaceCondition: userObservedHints?.surfaceCondition || SurfaceCondition.NOT_VISIBLE,
        seatingAvailability: userObservedHints?.seatingAvailability || SeatingAvailability.NOT_VISIBLE,
        toiletAccessibility: userObservedHints?.toiletAccessibility || ToiletAccessibility.NOT_VISIBLE,
        lightingLevel: userObservedHints?.lightingLevel || LightingLevel.NOT_VISIBLE,
        crowdLevel: userObservedHints?.crowdLevel || CrowdLevel.NOT_VISIBLE,
        // Waktu kunjungan diteruskan apa adanya, tidak diminta ke AI: hanya
        // pelapor yang tahu kapan ia berdiri di sana, dan menebaknya dari foto
        // adalah persis jenis karangan yang ingin dihindari.
        ...(userObservedHints?.visitedAt ? { visitedAt: userObservedHints.visitedAt } : {}),
      },
    };
  }
}

// Schema untuk Sintesis Wawasan Lokasi
const LOCATION_SYNTHESIS_SCHEMA = {
  name: 'location_synthesis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Ringkasan narasi 2-4 kalimat padat tentang aksesibilitas lokasi terkini.',
      },
      keyPoints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Poin-poin wawasan utama.',
      },
      strengths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Kelebihan fasilitas ramah disabilitas di lokasi ini.',
      },
      barriers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Rintangan atau kendala aksesibilitas yang masih ditemukan.',
      },
      communityObserved: {
        type: 'object',
        properties: {
          rampStatus: { type: 'string', enum: ['GOOD', 'DAMAGED', 'NONE', 'TIDAK_DISEBUT'] },
          guidingBlockStatus: { type: 'string', enum: ['GOOD', 'DAMAGED', 'NONE', 'TIDAK_DISEBUT'] },
          sidewalkCondition: { type: 'string', enum: ['GOOD', 'NARROW', 'DAMAGED', 'BLOCKED', 'TIDAK_DISEBUT'] },
          lightingLevel: { type: 'string', enum: ['BRIGHT', 'DIM', 'DARK', 'TIDAK_DISEBUT'] },
          toiletAccessibility: { type: 'string', enum: ['AVAILABLE_GOOD', 'AVAILABLE_DAMAGED', 'NOT_AVAILABLE', 'TIDAK_DISEBUT'] },
        },
        required: ['rampStatus', 'guidingBlockStatus', 'sidewalkCondition', 'lightingLevel', 'toiletAccessibility'],
        additionalProperties: false,
      },
    },
    required: ['summary', 'keyPoints', 'strengths', 'barriers', 'communityObserved'],
    additionalProperties: false,
  },
};

/**
 * Mensintesis dan memperbarui agregat rating dan deskripsi AI pada entitas Location
 * ketika ada Activity baru yang di-tag pada tempat tersebut.
 */
export async function synthesizeLocationInsightsWithAI(locationId: string): Promise<void> {
  try {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: {
        activities: {
          where: { status: 'PUBLIC' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!location || location.activities.length === 0) {
      return;
    }

    // Ambil sampel aktivitas terbaru untuk disintesis oleh AI menjadi ringkasan poin tempat
    const recentActivitiesContext = location.activities.map((a) => ({
      title: a.title,
      description: a.description,
      aiAnalysis: a.aiAnalysis,
      observedParameters: a.observedParameters,
      createdAt: a.createdAt,
    }));

    const synthesisPrompt = `Anda adalah AI Lead Spatial Evaluator DifaMap.
Tugas Anda adalah memperbarui ringkasan deskripsi (aiSummary) dan poin wawasan (aiInsights) untuk lokasi: "${location.name}" (${location.entityType} - ${location.category}).

Data aktivitas komunitas terbaru di lokasi ini:
${JSON.stringify(recentActivitiesContext, null, 2)}

Buatkan deskripsi ringkas poin-poin aksesibilitas terkini (maksimal 3-4 kalimat padat dalam bahasa Indonesia) serta daftar poin kekuatan dan rintangan untuk disabilitas fisik/sensorik.

PENTING: field "communityObserved" adalah CATATAN LAPORAN PENGGUNA, bukan status resmi lokasi. Isi apa adanya sesuai yang dilaporkan pengguna, dan gunakan "TIDAK_DISEBUT" bila laporan tidak menyinggung parameter tersebut. Jangan menebak.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: {
        type: 'json_schema',
        json_schema: LOCATION_SYNTHESIS_SCHEMA as any,
      },
      messages: [
        { role: 'system', content: 'Anda adalah pakar audit aksesibilitas DifaMap.' },
        { role: 'user', content: synthesisPrompt },
      ],
      temperature: 0.2,
    });

    catatPemakaian('sintesis-lokasi', response.usage);

    const raw = response.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw);

      // Hanya update kolom naratif dan wawasan. Skor resmi dan status fasilitas survei tetap terjaga.
      await prisma.location.update({
        where: { id: locationId },
        data: {
          aiSummary: parsed.summary || location.aiSummary,
          aiInsights: {
            keyPoints: parsed.keyPoints || [],
            strengths: parsed.strengths || [],
            barriers: parsed.barriers || [],
            communityObserved: parsed.communityObserved || null,
            basedOnActivityCount: location.activities.length,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    }
  } catch (err) {
    console.error(`Failed to synthesize location insights for ${locationId}:`, err);
  }
}
