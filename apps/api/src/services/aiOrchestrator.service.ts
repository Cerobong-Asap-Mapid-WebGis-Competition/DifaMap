import { openai } from '../lib/openai.js';
import { prisma } from '../lib/prisma.js';
import { DamageSeverity, FacilityType } from '@prisma/client';

export interface AIAnalysisResult {
  facilityType: FacilityType;
  damageSeverity: DamageSeverity;
  accessibilityScore: number; // 1.0 (Sangat Buruk) - 5.0 (Sangat Baik)
  tags: string[];
  summary: string;
  barrierType: string;
  actionRecommendation: string;
}

export interface CreateReportInput {
  userId: string;
  locationId: string;
  description: string;
  photoUrl?: string;
  userScore: number;
}

/**
 * Menganalisis teks laporan infrastruktur aksesibilitas menggunakan OpenAI Structured Output
 */
export async function analyzeAccessibilityReport(
  description: string,
  userScore: number,
  photoUrl?: string
): Promise<AIAnalysisResult> {
  const systemPrompt = `
Anda adalah AI Spatial & Accessibility Inspector untuk platform WebGIS DifaMap (Kompetisi WebGIS MAPID 2026 - Mass Transportation Edition).
Tugas Anda adalah menganalisis laporan kondisi aksesibilitas fisik penyandang disabilitas (tunanetra, pengguna kursi roda, lansia) di sekitar halte/titik transit massal di Makassar.

Instruksi Analisis:
1. Identifikasi tipe fasilitas yang dilaporkan (facilityType):
   - "RAMP", "GUIDING_BLOCK", "SIDEWALK", "ELEVATOR", "TACTILE_SIGNAGE", "CROSSING", atau "OTHER"
2. Tentukan tingkat keparahan kerusakan (damageSeverity):
   - "NONE": Fasilitas sempurna / sangat layak
   - "LOW": Kerusakan minor, masih dapat dilewati secara mandiri
   - "MODERATE": Kerusakan sedang, sulit dilewati atau butuh bantuan pendamping
   - "SEVERE": Rusak total, guiding block terputus parah, ramp terhalang permanen, berbahaya
3. Hitung skor kelayakan aksesibilitas objektif (accessibilityScore):
   - Skala Float 1.0 (Sangat Rusak/Berbahaya) hingga 5.0 (Sangat Aksesibel)
4. Buat daftar tag masalah spesifik (misal: ["ramp curam", "guiding block terputus", "trotoar berlubang"]).
5. Tuliskan ringkasan singkat kondisi dan rekomendasi aksi perbaikan konkret untuk dinas/operator terkait.

Format output HARUS selalu berupa JSON murni dengan format:
{
  "facilityType": "RAMP" | "GUIDING_BLOCK" | "SIDEWALK" | "ELEVATOR" | "TACTILE_SIGNAGE" | "CROSSING" | "OTHER",
  "damageSeverity": "NONE" | "LOW" | "MODERATE" | "SEVERE",
  "accessibilityScore": number (1.0 to 5.0),
  "tags": string[],
  "summary": string,
  "barrierType": string,
  "actionRecommendation": string
}
`;

  const userContent = [
    `Deskripsi Laporan Pengguna: "${description}"`,
    `Skor Awal Pengguna: ${userScore}/5.0`,
    photoUrl ? `Foto Lampiran: ${photoUrl}` : 'Tidak ada lampiran foto.',
  ].join('\n');

  try {
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

    const parsed: AIAnalysisResult = JSON.parse(rawContent);

    // Validasi & fallback boundaries
    const score = Math.max(1.0, Math.min(5.0, Number(parsed.accessibilityScore) || userScore));

    return {
      facilityType: Object.values(FacilityType).includes(parsed.facilityType)
        ? parsed.facilityType
        : FacilityType.OTHER,
      damageSeverity: Object.values(DamageSeverity).includes(parsed.damageSeverity)
        ? parsed.damageSeverity
        : DamageSeverity.LOW,
      accessibilityScore: parseFloat(score.toFixed(2)),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      summary: parsed.summary || 'Laporan kondisi fasilitas transit.',
      barrierType: parsed.barrierType || 'Rintangan Fisik',
      actionRecommendation: parsed.actionRecommendation || 'Perlu inspeksi berkala di lapangan.',
    };
  } catch (error) {
    console.error('Error during OpenAI report analysis:', error);
    // Fallback cerdas jika OpenAI API mengalami timeout atau kegagalan jaringan
    return {
      facilityType: FacilityType.OTHER,
      damageSeverity: userScore <= 2 ? DamageSeverity.SEVERE : userScore <= 3 ? DamageSeverity.MODERATE : DamageSeverity.NONE,
      accessibilityScore: userScore,
      tags: ['manual-fallback', 'analisis-tertunda'],
      summary: description,
      barrierType: 'Perlu Verifikasi Manual',
      actionRecommendation: 'Jadwalkan verifikasi surveyor lapangan.',
    };
  }
}

/**
 * Service orchestrator lengkap: Mengekstrak AI -> Menyimpan Report via Prisma
 */
export async function createCommunityReportWithAI(input: CreateReportInput) {
  const { userId, locationId, description, photoUrl, userScore } = input;

  // 1. Eksekusi Analisis AI
  const aiResult = await analyzeAccessibilityReport(description, userScore, photoUrl);

  // 2. Simpan ke database via Prisma Client
  // Trigger PostgreSQL di database akan otomatis memutakhirkan skor agregat di tabel Location
  const newReport = await prisma.report.create({
    data: {
      userId,
      locationId,
      facilityType: aiResult.facilityType,
      damageSeverity: aiResult.damageSeverity,
      description,
      photoUrl: photoUrl || null,
      userScore,
      aiScore: aiResult.accessibilityScore,
      aiAnalysis: {
        tags: aiResult.tags,
        summary: aiResult.summary,
        barrierType: aiResult.barrierType,
        actionRecommendation: aiResult.actionRecommendation,
      },
      status: 'VERIFIED',
    },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          category: true,
          avgAccessibilityScore: true,
          priorityIndex: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return newReport;
}
