import { openai } from '../lib/openai.js';
import { prisma } from '../lib/prisma.js';
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
Anda adalah AI Spatial & Accessibility Inspector untuk platform WebGIS DifaMap (Kompetisi WebGIS MAPID 2026 - Makassar).
Tugas Anda adalah menganalisis kiriman aktivitas & kondisi aksesibilitas fisik bagi penyandang disabilitas (pengguna kursi roda / tunadaksa, tunanetra, low vision, lansia) di Kota Makassar.

Pedoman Penilaian Aksesibilitas (Scoring Murni dari AI):
1. **overallScore (1.0 - 5.0 Bintang)**:
   - 4.5 - 5.0: Fasilitas sangat ramah disabilitas (ada ramp landai <8%, guiding block tersambung, toilet disabilitas/lift, trotoar lebar & rata, penerangan terang).
   - 3.5 - 4.4: Aksesibel cukup baik dengan catatan minor (misal ramp ada tapi agak curam, atau paving sedikit tidak rata).
   - 2.5 - 3.4: Kurang aksesibel, membutuhkan pendamping bagi pengguna kursi roda atau tunanetra (trotoar sempit/rusak, tidak ada ramp, pencahayaan redup).
   - 1.0 - 2.4: Sangat tidak ramah disabilitas / berbahaya (guiding block terputus parah, trotoar terhalang total oleh PKL/tiang, tangga tanpa ramp sama sekali).

2. **Parameter Fisik & Aksesibilitas**:
   - rampStatus: "GOOD" | "DAMAGED" | "NONE"
   - guidingBlockStatus: "GOOD" | "DAMAGED" | "NONE"
   - sidewalkCondition: (khusus trotoar/jalan) "GOOD" | "NARROW" | "DAMAGED" | "BLOCKED" | "NOT_APPLICABLE"
   - surfaceCondition: "SMOOTH" | "SLIPPERY" | "POTHOLE" | "UNEVEN"
   - seatingAvailability: "AVAILABLE" | "NOT_AVAILABLE"
   - toiletAccessibility: "AVAILABLE_GOOD" | "AVAILABLE_DAMAGED" | "NOT_AVAILABLE"

3. **Parameter Keamanan & Kenyamanan**:
   - lightingLevel: "BRIGHT" | "DIM" | "DARK"
   - crowdLevel: "QUIET" | "MODERATE" | "CROWDED"

4. **Keluarkan JSON Murni dengan format berikut**:
{
  "overallScore": number (1.0 to 5.0),
  "physicalScore": number (1.0 to 5.0),
  "safetyScore": number (1.0 to 5.0),
  "tags": string[],
  "summary": string,
  "barrierType": string,
  "actionRecommendation": string,
  "observedParameters": {
    "rampStatus": "GOOD" | "DAMAGED" | "NONE",
    "guidingBlockStatus": "GOOD" | "DAMAGED" | "NONE",
    "sidewalkCondition": "GOOD" | "NARROW" | "DAMAGED" | "BLOCKED" | "NOT_APPLICABLE",
    "surfaceCondition": "SMOOTH" | "SLIPPERY" | "POTHOLE" | "UNEVEN",
    "seatingAvailability": "AVAILABLE" | "NOT_AVAILABLE",
    "toiletAccessibility": "AVAILABLE_GOOD" | "AVAILABLE_DAMAGED" | "NOT_AVAILABLE",
    "lightingLevel": "BRIGHT" | "DIM" | "DARK",
    "crowdLevel": "QUIET" | "MODERATE" | "CROWDED"
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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = JSON.parse(rawContent);

    const overallScore = Math.max(1.0, Math.min(5.0, Number(parsed.overallScore) || 3.0));
    const physicalScore = Math.max(1.0, Math.min(5.0, Number(parsed.physicalScore) || overallScore));
    const safetyScore = Math.max(1.0, Math.min(5.0, Number(parsed.safetyScore) || 3.5));

    return {
      overallScore: parseFloat(overallScore.toFixed(1)),
      physicalScore: parseFloat(physicalScore.toFixed(1)),
      safetyScore: parseFloat(safetyScore.toFixed(1)),
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['aksesibilitas-makassar'],
      summary: parsed.summary || 'Aktivitas pemetaan aksesibilitas disabilitas di Makassar.',
      barrierType: parsed.barrierType || 'Tidak ada hambatan signifikan',
      actionRecommendation: parsed.actionRecommendation || 'Pertahankan kondisi fasilitas yang sudah ramah disabilitas.',
      observedParameters: {
        rampStatus: parsed.observedParameters?.rampStatus || userObservedHints?.rampStatus || RampStatus.NONE,
        guidingBlockStatus: parsed.observedParameters?.guidingBlockStatus || userObservedHints?.guidingBlockStatus || GuidingBlockStatus.NONE,
        sidewalkCondition: parsed.observedParameters?.sidewalkCondition || userObservedHints?.sidewalkCondition || SidewalkCondition.NOT_APPLICABLE,
        surfaceCondition: parsed.observedParameters?.surfaceCondition || userObservedHints?.surfaceCondition || SurfaceCondition.SMOOTH,
        seatingAvailability: parsed.observedParameters?.seatingAvailability || userObservedHints?.seatingAvailability || SeatingAvailability.NOT_AVAILABLE,
        toiletAccessibility: parsed.observedParameters?.toiletAccessibility || userObservedHints?.toiletAccessibility || ToiletAccessibility.NOT_AVAILABLE,
        lightingLevel: parsed.observedParameters?.lightingLevel || userObservedHints?.lightingLevel || LightingLevel.BRIGHT,
        crowdLevel: parsed.observedParameters?.crowdLevel || userObservedHints?.crowdLevel || CrowdLevel.MODERATE,
      },
    };
  } catch (error) {
    console.error('Error in analyzeAccessibilityActivity AI orchestrator:', error);
    // Fallback cerdas heuristik
    return {
      overallScore: 3.0,
      physicalScore: 3.0,
      safetyScore: 3.0,
      tags: ['laporan-komunitas', 'makassar'],
      summary: description || title,
      barrierType: 'Perlu verifikasi lanjutan',
      actionRecommendation: 'Jadwalkan survei validasi fasilitas aksesibilitas.',
      observedParameters: {
        rampStatus: userObservedHints?.rampStatus || RampStatus.NONE,
        guidingBlockStatus: userObservedHints?.guidingBlockStatus || GuidingBlockStatus.NONE,
        sidewalkCondition: userObservedHints?.sidewalkCondition || SidewalkCondition.NOT_APPLICABLE,
        surfaceCondition: userObservedHints?.surfaceCondition || SurfaceCondition.SMOOTH,
        seatingAvailability: userObservedHints?.seatingAvailability || SeatingAvailability.NOT_AVAILABLE,
        toiletAccessibility: userObservedHints?.toiletAccessibility || ToiletAccessibility.NOT_AVAILABLE,
        lightingLevel: userObservedHints?.lightingLevel || LightingLevel.BRIGHT,
        crowdLevel: userObservedHints?.crowdLevel || CrowdLevel.MODERATE,
      },
    };
  }
}

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

    if (!location) return;

    if (location.activities.length === 0) {
      return;
    }

    // Hitung rata-rata skor AI dari seluruh activity publik
    const validScores = location.activities
      .map((a) => a.aiScore)
      .filter((s): s is number => typeof s === 'number' && s > 0);

    const avgScore = validScores.length > 0
      ? validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length
      : location.overallScore || 3.5;

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

Keluarkan JSON format:
{
  "summary": string,
  "keyPoints": string[],
  "strengths": string[],
  "barriers": string[],
  "latestRampStatus": "GOOD" | "DAMAGED" | "NONE",
  "latestGuidingBlockStatus": "GOOD" | "DAMAGED" | "NONE",
  "latestSidewalkCondition": "GOOD" | "NARROW" | "DAMAGED" | "BLOCKED" | "NOT_APPLICABLE",
  "latestLightingLevel": "BRIGHT" | "DIM" | "DARK",
  "latestToiletAccessibility": "AVAILABLE_GOOD" | "AVAILABLE_DAMAGED" | "NOT_AVAILABLE"
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

    const raw = response.choices[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw);

      await prisma.location.update({
        where: { id: locationId },
        data: {
          overallScore: parseFloat(avgScore.toFixed(1)),
          aiSummary: parsed.summary || location.aiSummary,
          aiInsights: {
            keyPoints: parsed.keyPoints || [],
            strengths: parsed.strengths || [],
            barriers: parsed.barriers || [],
            updatedAt: new Date().toISOString(),
          },
          rampStatus: parsed.latestRampStatus || location.rampStatus,
          guidingBlockStatus: parsed.latestGuidingBlockStatus || location.guidingBlockStatus,
          sidewalkCondition: parsed.latestSidewalkCondition || location.sidewalkCondition,
          lightingLevel: parsed.latestLightingLevel || location.lightingLevel,
          toiletAccessibility: parsed.latestToiletAccessibility || location.toiletAccessibility,
          totalActivities: location.activities.length,
        },
      });
    }
  } catch (err) {
    console.error(`Failed to synthesize location insights for ${locationId}:`, err);
  }
}
