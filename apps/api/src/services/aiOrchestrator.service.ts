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

/**
 * Skema Structured Outputs untuk penilaian titik.
 *
 * Berbeda dari mode `json_object` yang hanya menjamin keluarannya JSON yang
 * SAH, skema ini menjamin BENTUKNYA. Nilai di luar daftar enum tidak mungkin
 * keluar - AI tidak bisa menjawab "ADA_BAIK" atau "tidak_terlihat" alih-alih
 * "GOOD" atau "NOT_VISIBLE".
 *
 * Sebelumnya, jawaban yang melenceng akan diam-diam jatuh ke nilai cadangan
 * saat parsing, dan tidak ada yang tahu penilaiannya gagal. Untuk sistem yang
 * keluarannya menjadi skor keselamatan, kegagalan senyap seperti itu mahal.
 *
 * Mode strict menuntut SELURUH properti terdaftar di `required` dan
 * additionalProperties: false. Itu justru sejalan dengan yang kita mau: AI
 * harus menjawab kedelapan parameter, memakai NOT_VISIBLE bila tidak yakin,
 * bukan menghilangkan field-nya.
 */
const SKEMA_PENILAIAN = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overallScore', 'physicalScore', 'safetyScore', 'confidence',
    'tags', 'summary', 'barrierType', 'actionRecommendation', 'observedParameters',
  ],
  properties: {
    overallScore: { type: 'number', description: 'Skor aksesibilitas keseluruhan, 1.0 sampai 5.0' },
    physicalScore: { type: 'number', description: 'Skor kondisi fisik, 1.0 sampai 5.0' },
    safetyScore: { type: 'number', description: 'Skor keamanan & kenyamanan, 1.0 sampai 5.0' },
    confidence: { type: 'number', description: 'Keyakinan atas penilaian ini, 0.0 sampai 1.0' },
    tags: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    barrierType: { type: 'string' },
    actionRecommendation: { type: 'string' },
    observedParameters: {
      type: 'object',
      additionalProperties: false,
      required: [
        'rampStatus', 'guidingBlockStatus', 'sidewalkCondition', 'surfaceCondition',
        'seatingAvailability', 'toiletAccessibility', 'lightingLevel', 'crowdLevel',
      ],
      properties: {
        rampStatus: { type: 'string', enum: ['GOOD', 'DAMAGED', 'NONE', 'NOT_VISIBLE'] },
        guidingBlockStatus: { type: 'string', enum: ['GOOD', 'DAMAGED', 'NONE', 'NOT_VISIBLE'] },
        sidewalkCondition: { type: 'string', enum: ['GOOD', 'NARROW', 'DAMAGED', 'BLOCKED', 'NOT_APPLICABLE', 'NOT_VISIBLE'] },
        surfaceCondition: { type: 'string', enum: ['SMOOTH', 'SLIPPERY', 'POTHOLE', 'UNEVEN', 'NOT_VISIBLE'] },
        seatingAvailability: { type: 'string', enum: ['AVAILABLE', 'NOT_AVAILABLE', 'NOT_VISIBLE'] },
        toiletAccessibility: { type: 'string', enum: ['AVAILABLE_GOOD', 'AVAILABLE_DAMAGED', 'NOT_AVAILABLE', 'NOT_VISIBLE'] },
        lightingLevel: { type: 'string', enum: ['BRIGHT', 'DIM', 'DARK', 'NOT_VISIBLE'] },
        crowdLevel: { type: 'string', enum: ['QUIET', 'MODERATE', 'CROWDED', 'NOT_VISIBLE'] },
      },
    },
  },
} as const;

export interface AIAnalysisOutput {
  overallScore: number; // 1.0 - 5.0 (Rating Bintang)
  /** Keyakinan AI atas penilaiannya, 0.0 - 1.0. Turun bila banyak NOT_VISIBLE. */
  confidence: number;
  physicalScore: number; // 1.0 - 5.0
  safetyScore: number; // 1.0 - 5.0
  tags: string[];
  summary: string;
  barrierType: string;
  actionRecommendation: string;
  observedParameters: {
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

export interface AnalyzeActivityInput {
  title: string;
  description: string;
  specificLocation?: string;
  mediaUrls?: string[];
  entityTypeHint?: 'PLACE' | 'SIDEWALK' | 'TRANSIT_HUB';
  userObservedHints?: {
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

/**
 * Menganalisis kiriman aktivitas / laporan aksesibilitas menggunakan OpenAI Structured Output
 * Menghitung rating bintang objektif (1.0 - 5.0) dan mengekstrak parameter fisik & keamanan.
 */
export async function analyzeAccessibilityActivity(
  input: AnalyzeActivityInput
): Promise<AIAnalysisOutput> {
  const { title, description, specificLocation, mediaUrls = [], entityTypeHint = 'PLACE', userObservedHints } = input;

  const systemPrompt = `
Anda adalah AI Spatial & Accessibility Inspector untuk platform WebGIS DifaMap (Kompetisi WebGIS MAPID 2026).
Tugas Anda adalah menganalisis kiriman aktivitas & kondisi aksesibilitas fisik bagi penyandang disabilitas (pengguna kursi roda / tunadaksa, tunanetra, low vision, lansia) di wilayah Kota Makassar dan Kabupaten Gowa (7 zona kecamatan: Tamalate, Tamalanrea, Mariso, Ujung Pandang, Rappocini, Bontomarannu, Somba Opu).

Pedoman Penilaian Aksesibilitas (Scoring Murni dari AI):
1. **overallScore (1.0 - 5.0 Bintang)**:
   - 4.5 - 5.0: Fasilitas sangat ramah disabilitas (ada ramp landai <8%, guiding block tersambung, toilet disabilitas/lift, trotoar lebar & rata, penerangan terang).
   - 3.5 - 4.4: Aksesibel cukup baik dengan catatan minor (misal ramp ada tapi agak curam, atau paving sedikit tidak rata).
   - 2.5 - 3.4: Kurang aksesibel, membutuhkan pendamping bagi pengguna kursi roda atau tunanetra (trotoar sempit/rusak, tidak ada ramp, pencahayaan redup).
   - 1.0 - 2.4: Sangat tidak ramah disabilitas / berbahaya (guiding block terputus parah, trotoar terhalang total oleh PKL/tiang, tangga tanpa ramp sama sekali).

2. **ATURAN PALING PENTING - JANGAN MENEBAK**:
   Sebelum menjawab SETIAP parameter, tanyakan pada diri sendiri:

     "Apakah saya MELIHAT buktinya di foto atau MEMBACANYA di deskripsi?
      Atau saya menyimpulkannya dari konteks umum?"

   Kalau menyimpulkan, jawabannya WAJIB "NOT_VISIBLE". Itu jawaban yang benar
   dan dihargai, bukan kegagalan.

   JANGAN PERNAH menjawab "NONE" hanya karena sesuatu tidak terlihat. "NONE"
   berarti Anda benar-benar melihat bahwa fasilitas itu tidak ada di lokasi.
   Perbedaan ini menentukan keselamatan: menyatakan "tidak ada ramp" padahal
   ramp hanya tidak tertangkap kamera akan membuat pengguna kursi roda
   membatalkan perjalanan ke tempat yang sebenarnya layak, dan membuat
   pemerintah salah mengalokasikan anggaran perbaikan.

   **TIGA PARAMETER YANG PALING SERING SALAH DIJAWAB** - baca definisinya
   baik-baik, karena nama enumnya menyesatkan:

   - lightingLevel BUKAN tentang terangnya foto. Ini tentang PENERANGAN BUATAN
     (lampu jalan, lampu taman) yang menentukan apakah lokasi aman dilewati
     PADA MALAM HARI. Foto siang hari yang cerah TIDAK memberi tahu apa pun
     soal ini. Jawab "BRIGHT" HANYA bila lampu jalan terlihat menyala, atau
     deskripsi menyebutkan kondisi penerangan malam. Selain itu: "NOT_VISIBLE".

   - crowdLevel adalah POLA keramaian lokasi, bukan jumlah orang pada satu
     jepretan. Foto sepi bisa jadi diambil saat jam sepi di lokasi yang biasanya
     ramai. Jawab selain "NOT_VISIBLE" hanya bila deskripsi surveyor menyebutkan
     tingkat keramaiannya.

   - seatingAvailability dan toiletAccessibility: jawab "NOT_AVAILABLE" HANYA
     bila Anda melihat area yang jelas tidak menyediakannya, atau deskripsi
     menyatakannya. Tidak terlihatnya bangku di satu sudut foto bukan bukti
     tidak ada bangku di lokasi.

3. **Parameter Fisik & Aksesibilitas**:
   - rampStatus: "GOOD" | "DAMAGED" | "NONE" | "NOT_VISIBLE"
   - guidingBlockStatus: "GOOD" | "DAMAGED" | "NONE" | "NOT_VISIBLE"
   - sidewalkCondition: (khusus trotoar/jalan) "GOOD" | "NARROW" | "DAMAGED" | "BLOCKED" | "NOT_APPLICABLE" | "NOT_VISIBLE"
     (NOT_APPLICABLE = memang bukan trotoar, misal lobi mall. NOT_VISIBLE = trotoar mungkin ada tapi tidak terlihat.)
   - surfaceCondition: "SMOOTH" | "SLIPPERY" | "POTHOLE" | "UNEVEN" | "NOT_VISIBLE"
   - seatingAvailability: "AVAILABLE" | "NOT_AVAILABLE" | "NOT_VISIBLE"
   - toiletAccessibility: "AVAILABLE_GOOD" | "AVAILABLE_DAMAGED" | "NOT_AVAILABLE" | "NOT_VISIBLE"
     (Toilet hampir selalu di dalam bangunan - pakai NOT_VISIBLE kecuali laporan menyebutnya.)

4. **Parameter Keamanan & Kenyamanan**:
   - lightingLevel: "BRIGHT" | "DIM" | "DARK" | "NOT_VISIBLE"
     (Foto siang hari TIDAK menunjukkan kondisi lampu jalan malam - pakai NOT_VISIBLE.)
   - crowdLevel: "QUIET" | "MODERATE" | "CROWDED" | "NOT_VISIBLE"

5. **confidence (0.0 - 1.0)**:
   Seberapa yakin Anda atas penilaian keseluruhan. Turunkan nilainya bila foto
   buram, gelap, sudutnya sempit, atau banyak parameter yang NOT_VISIBLE.

6. **Skor dinilai HANYA dari yang terlihat**:
   Jangan menurunkan skor karena parameter tidak terlihat. Lokasi berfoto buruk
   bukan lokasi buruk. Nilailah dari bukti yang ada, lalu nyatakan
   ketidakpastiannya lewat confidence dan NOT_VISIBLE.

7. **Keluarkan JSON Murni dengan format berikut**:
{
  "overallScore": number (1.0 to 5.0),
  "physicalScore": number (1.0 to 5.0),
  "safetyScore": number (1.0 to 5.0),
  "tags": string[],
  "summary": string,
  "barrierType": string,
  "actionRecommendation": string,
  "confidence": number (0.0 to 1.0),
  "observedParameters": {
    "rampStatus": "GOOD" | "DAMAGED" | "NONE" | "NOT_VISIBLE",
    "guidingBlockStatus": "GOOD" | "DAMAGED" | "NONE" | "NOT_VISIBLE",
    "sidewalkCondition": "GOOD" | "NARROW" | "DAMAGED" | "BLOCKED" | "NOT_APPLICABLE" | "NOT_VISIBLE",
    "surfaceCondition": "SMOOTH" | "SLIPPERY" | "POTHOLE" | "UNEVEN" | "NOT_VISIBLE",
    "seatingAvailability": "AVAILABLE" | "NOT_AVAILABLE" | "NOT_VISIBLE",
    "toiletAccessibility": "AVAILABLE_GOOD" | "AVAILABLE_DAMAGED" | "NOT_AVAILABLE" | "NOT_VISIBLE",
    "lightingLevel": "BRIGHT" | "DIM" | "DARK" | "NOT_VISIBLE",
    "crowdLevel": "QUIET" | "MODERATE" | "CROWDED" | "NOT_VISIBLE"
  }
}
`;

  // Format pesan user dengan menyertakan teks & URL foto (jika ada)
  const textPrompt = `
Nama Aktivitas: "${title}"
Deskripsi Laporan Pengguna: "${description}"
Lokasi Spesifik: "${specificLocation || 'Tidak disebutkan'}"
Tipe Entitas: "${entityTypeHint}"
Petunjuk Observasi Pengguna: ${JSON.stringify(userObservedHints || {})}
Foto Lampiran: ${mediaUrls.length > 0 ? mediaUrls.join(', ') : 'Tidak ada foto.'}
`;

  try {
    const userContent: Array<any> = [{ type: 'text', text: textPrompt }];

    // Jika ada foto media URL publik, masukkan ke model GPT-4o-mini untuk inspeksi visual
    if (mediaUrls.length > 0) {
      for (const url of mediaUrls.slice(0, 3)) {
        if (url.startsWith('http://') || url.startsWith('https://')) {
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
        json_schema: { name: 'penilaian_aksesibilitas', strict: true, schema: SKEMA_PENILAIAN as any },
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
    });

    catatPemakaian('penilaian-titik', response.usage);

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = JSON.parse(rawContent);

    const overallScore = Math.max(1.0, Math.min(5.0, Number(parsed.overallScore) || 3.0));
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) ?? 0.5));
    const physicalScore = Math.max(1.0, Math.min(5.0, Number(parsed.physicalScore) || overallScore));
    const safetyScore = Math.max(1.0, Math.min(5.0, Number(parsed.safetyScore) || 3.5));

    return {
      overallScore: parseFloat(overallScore.toFixed(1)),
      confidence: parseFloat(confidence.toFixed(2)),
      physicalScore: parseFloat(physicalScore.toFixed(1)),
      safetyScore: parseFloat(safetyScore.toFixed(1)),
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['aksesibilitas-makassar'],
      summary: parsed.summary || 'Aktivitas pemetaan aksesibilitas disabilitas di Makassar.',
      barrierType: parsed.barrierType || 'Tidak ada hambatan signifikan',
      actionRecommendation: parsed.actionRecommendation || 'Pertahankan kondisi fasilitas yang sudah ramah disabilitas.',
      // Cadangan selalu NOT_VISIBLE, tidak pernah nilai konkret.
      //
      // Versi lama jatuh ke NONE, SMOOTH, BRIGHT, dan MODERATE ketika AI tidak
      // menjawab. Artinya kegagalan AI diam-diam berubah menjadi pernyataan
      // fakta: "tidak ada ramp", "permukaan halus", "penerangan terang" —
      // padahal tidak ada yang pernah mengamatinya.
      observedParameters: {
        rampStatus: parsed.observedParameters?.rampStatus || userObservedHints?.rampStatus || RampStatus.NOT_VISIBLE,
        guidingBlockStatus: parsed.observedParameters?.guidingBlockStatus || userObservedHints?.guidingBlockStatus || GuidingBlockStatus.NOT_VISIBLE,
        sidewalkCondition: parsed.observedParameters?.sidewalkCondition || userObservedHints?.sidewalkCondition || SidewalkCondition.NOT_VISIBLE,
        surfaceCondition: parsed.observedParameters?.surfaceCondition || userObservedHints?.surfaceCondition || SurfaceCondition.NOT_VISIBLE,
        seatingAvailability: parsed.observedParameters?.seatingAvailability || userObservedHints?.seatingAvailability || SeatingAvailability.NOT_VISIBLE,
        toiletAccessibility: parsed.observedParameters?.toiletAccessibility || userObservedHints?.toiletAccessibility || ToiletAccessibility.NOT_VISIBLE,
        lightingLevel: parsed.observedParameters?.lightingLevel || userObservedHints?.lightingLevel || LightingLevel.NOT_VISIBLE,
        crowdLevel: parsed.observedParameters?.crowdLevel || userObservedHints?.crowdLevel || CrowdLevel.NOT_VISIBLE,
      },
    };
  } catch (error) {
    console.error('Error in analyzeAccessibilityActivity AI orchestrator:', error);
    // Fallback cerdas heuristik
    // Panggilan AI gagal: tidak ada yang teramati, jadi jangan mengaku tahu apa pun.
    // confidence 0 menandai skor 3.0 di bawah sebagai penampung sementara,
    // bukan penilaian.
    return {
      overallScore: 3.0,
      confidence: 0,
      physicalScore: 3.0,
      safetyScore: 3.0,
      tags: ['laporan-komunitas', 'makassar', 'perlu-penilaian-ulang'],
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
      },
    };
  }
}

/**
 * Menyegarkan ringkasan naratif sebuah Location berdasarkan laporan komunitas
 * terbaru yang ditandai ke tempat tersebut.
 *
 * BATAS TEGAS: fungsi ini TIDAK BOLEH menulis overall_score, physical_score,
 * safety_score, maupun kolom status fasilitas (rampStatus, guidingBlockStatus,
 * sidewalkCondition, lightingLevel, toiletAccessibility). Semua itu skor dan
 * status RESMI yang berasal dari penilaian AI atas data survei.
 *
 * Versi sebelumnya menimpa semuanya dengan hasil pembacaan AI atas teks yang
 * ditulis pengguna. Akibatnya siapa pun yang login bisa mengubah status ramp
 * dan guiding block resmi sebuah lokasi hanya dengan menulis deskripsi —
 * untuk produk yang dipakai memutuskan apakah aman berangkat dengan kursi
 * roda, itu bukan sekadar cacat data.
 *
 * Yang boleh ditulis fungsi ini: aiSummary dan aiInsights (naratif). Observasi
 * komunitas atas kondisi fasilitas tetap disimpan, tapi di dalam
 * aiInsights.communityObserved sebagai catatan — bukan sebagai status resmi.
 *
 * community_score dan community_report_count dihitung trigger database, bukan
 * di sini, supaya angkanya konsisten walau activity masuk lewat jalur lain.
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

    if (!location) return;

    if (location.activities.length === 0) {
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

    const synthesisPrompt = `
Anda adalah AI Lead Spatial Evaluator DifaMap.
Tugas Anda adalah memperbarui ringkasan deskripsi (aiSummary) dan poin wawasan (aiInsights) untuk lokasi: "${location.name}" (${location.entityType} - ${location.category}).

Data aktivitas komunitas terbaru di lokasi ini:
${JSON.stringify(recentActivitiesContext, null, 2)}

Buatkan deskripsi ringkas poin-poin aksesibilitas terkini (maksimal 3-4 kalimat padat dalam bahasa Indonesia) serta daftar poin kekuatan dan rintangan untuk disabilitas fisik/sensorik.

PENTING: field "communityObserved" di bawah adalah CATATAN LAPORAN KOMUNITAS, bukan status resmi lokasi. Isi apa adanya sesuai yang dilaporkan pengguna, dan gunakan "TIDAK_DISEBUT" bila laporan tidak menyinggung parameter tersebut. Jangan menebak.

Keluarkan JSON format:
{
  "summary": string,
  "keyPoints": string[],
  "strengths": string[],
  "barriers": string[],
  "communityObserved": {
    "rampStatus": "GOOD" | "DAMAGED" | "NONE" | "TIDAK_DISEBUT",
    "guidingBlockStatus": "GOOD" | "DAMAGED" | "NONE" | "TIDAK_DISEBUT",
    "sidewalkCondition": "GOOD" | "NARROW" | "DAMAGED" | "BLOCKED" | "TIDAK_DISEBUT",
    "lightingLevel": "BRIGHT" | "DIM" | "DARK" | "TIDAK_DISEBUT",
    "toiletAccessibility": "AVAILABLE_GOOD" | "AVAILABLE_DAMAGED" | "NOT_AVAILABLE" | "TIDAK_DISEBUT"
  }
}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Anda adalah pakar audit aksesibilitas DifaMap.' },
        { role: 'user', content: synthesisPrompt },
      ],
      temperature: 0.2,
    });

    catatPemakaian('rangkuman-lokasi', response.usage);

    const raw = response.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw);

      // Hanya kolom naratif. Skor resmi, status fasilitas, dan pencacah
      // sengaja tidak ada di sini — lihat catatan di atas fungsi ini.
      await prisma.location.update({
        where: { id: locationId },
        data: {
          aiSummary: parsed.summary || location.aiSummary,
          aiInsights: {
            keyPoints: parsed.keyPoints || [],
            strengths: parsed.strengths || [],
            barriers: parsed.barriers || [],
            // Observasi komunitas disimpan sebagai catatan, BUKAN status resmi.
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
