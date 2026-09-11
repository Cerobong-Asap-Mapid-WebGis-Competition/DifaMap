import { PrismaClient } from '@prisma/client';
import { analyzeAccessibilityActivity } from '../src/services/aiOrchestrator.service.js';
import { prioritizeCameraPhotos } from '../src/services/mapidCompetition.service.js';
import { ringkasanPemakaian, resetPemakaian } from '../src/lib/aiUsage.js';

const prisma = new PrismaClient();

// Membaca argumen command line (contoh: --test atau --all atau --limit=5)
const args = process.argv.slice(2);
const isMissingOnly = args.includes('--missing-only');
const isAll = args.includes('--all');
const isTestMode = args.includes('--test') || (!isAll && !isMissingOnly && !args.some(a => a.startsWith('--limit=')));
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : (isTestMode ? 3 : undefined);

async function runOpenAiScoring() {
  console.log('===============================================================');
  console.log('🤖 DIFAMAP AI ACCESSIBILITY SCORING (OPENAI GPT-4O-MINI)');
  console.log('   Berdasarkan Catatan Teknis Tim Cerobong Asap MAPID 2026');
  console.log(`   Mode: ${isMissingOnly ? 'TITIK BELUM DIEVALUASI (MISSING PARAMS)' : (isTestMode ? 'TEST RUN (3 Titik Lapangan)' : (limit ? `LIMIT (${limit} Titik)` : 'SEMUA TITIK'))}`);
  console.log('===============================================================\n');

  // Hitungan token dimulai dari nol supaya ringkasan di akhir hanya mencakup
  // jalannya skrip ini, bukan sisa pemakaian dari proses lain.
  resetPemakaian();

  // Ambil aktivitas dari database
  let rawActivities = await prisma.activity.findMany({
    where: {
      status: 'PUBLIC',
    },
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      location: true,
    },
  });

  if (isMissingOnly) {
    rawActivities = rawActivities.filter(a => !a.observedParameters || typeof a.observedParameters !== 'object');
  }

  const activities = limit ? rawActivities.slice(0, limit) : rawActivities;

  if (activities.length === 0) {
    console.log('🎉 Semua activity sudah memiliki hasil evaluasi AI lengkap!');
    return;
  }

  console.log(`📋 Memproses ${activities.length} titik survei...\n`);

  let processedCount = 0;
  let totalOverallScore = 0;
  let totalConfidence = 0;

  for (let i = 0; i < activities.length; i++) {
    const act = activities[i];
    const sortedMedias = prioritizeCameraPhotos(act.mediaUrls);
    const primaryPhoto = sortedMedias[0] || null;

    console.log(`---------------------------------------------------------------`);
    console.log(`[${i + 1}/${activities.length}] Titik: "${act.title}"`);
    console.log(`📍 Lokasi: ${act.specificLocation || 'Makassar'}`);
    console.log(`📸 Foto: ${sortedMedias.length} file (${primaryPhoto ? 'Foto kamera lapangan ada' : 'Tanpa foto'})`);
    if (primaryPhoto) {
      console.log(`   URL Foto Utama: ${primaryPhoto.substring(0, 80)}...`);
    }

    try {
      // Panggil OpenAI Structured Output
      const startTime = Date.now();
      const analysis = await analyzeAccessibilityActivity({
        title: act.title,
        description: act.description,
        specificLocation: act.specificLocation || undefined,
        mediaUrls: sortedMedias,
      });
      const durationMs = Date.now() - startTime;

      console.log(`⏱️ Selesai dievaluasi dalam ${durationMs}ms`);
      console.log(`⭐ Skor AI : ${analysis.overallScore} / 5.0 (Fisik: ${analysis.physicalScore}, Aman: ${analysis.safetyScore})`);
      console.log(`🎯 Keyakinan AI (Confidence): ${(analysis.aiConfidence * 100).toFixed(0)}%`);
      console.log(`📝 Ringkasan: ${analysis.summary}`);
      console.log(`🚧 Hambatan: ${analysis.barrierType}`);
      console.log(`🔍 Parameter Terobservasi:`);
      console.log(`   - Ramp: ${analysis.observedParameters.rampStatus}`);
      console.log(`   - Guiding Block: ${analysis.observedParameters.guidingBlockStatus}`);
      console.log(`   - Trotoar: ${analysis.observedParameters.sidewalkCondition}`);
      console.log(`   - Permukaan: ${analysis.observedParameters.surfaceCondition}`);
      console.log(`   - Penerangan: ${analysis.observedParameters.lightingLevel}`);
      console.log(`   - Tempat Duduk: ${analysis.observedParameters.seatingAvailability}`);
      console.log(`   - Toilet: ${analysis.observedParameters.toiletAccessibility}`);
      console.log(`   - Keramaian: ${analysis.observedParameters.crowdLevel}`);

      // 1. Perbarui Activity di database
      const combinedTags = Array.from(new Set([...act.accessibilityTags, ...analysis.tags]));
      await prisma.activity.update({
        where: { id: act.id },
        data: {
          aiScore: analysis.overallScore,
          aiConfidence: analysis.aiConfidence,
          accessibilityTags: combinedTags,
          aiAnalysis: {
            summary: analysis.summary,
            barrierType: analysis.barrierType,
            actionRecommendation: analysis.actionRecommendation,
            physicalScore: analysis.physicalScore,
            safetyScore: analysis.safetyScore,
            aiConfidence: analysis.aiConfidence,
            evaluatedAt: new Date().toISOString(),
          },
          observedParameters: analysis.observedParameters,
        },
      });

      // 2. Perbarui Location terkait (jika ada)
      if (act.locationId) {
        await prisma.location.update({
          where: { id: act.locationId },
          data: {
            overallScore: analysis.overallScore,
            physicalScore: analysis.physicalScore,
            safetyScore: analysis.safetyScore,
            aiConfidence: analysis.aiConfidence,
            aiSummary: analysis.summary,
            aiInsights: {
              barrierType: analysis.barrierType,
              actionRecommendation: analysis.actionRecommendation,
              tags: analysis.tags,
              evaluatedAt: new Date().toISOString(),
            },
            rampStatus: analysis.observedParameters.rampStatus,
            guidingBlockStatus: analysis.observedParameters.guidingBlockStatus,
            sidewalkCondition: analysis.observedParameters.sidewalkCondition,
            surfaceCondition: analysis.observedParameters.surfaceCondition,
            seatingAvailability: analysis.observedParameters.seatingAvailability,
            toiletAccessibility: analysis.observedParameters.toiletAccessibility,
            lightingLevel: analysis.observedParameters.lightingLevel,
            crowdLevel: analysis.observedParameters.crowdLevel,
            // Catatan: priorityIndex TIDAK diubah manual karena dihitung otomatis oleh trigger database PostgreSQL
          },
        });
      }

      processedCount++;
      totalOverallScore += analysis.overallScore;
      totalConfidence += analysis.aiConfidence;

      // Jeda 600ms antar panggilan untuk menjaga batas rate limit OpenAI dan memaksimalkan cache
      if (i < activities.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    } catch (err: any) {
      console.error(`❌ Gagal mengevaluasi "${act.title}":`, err.message);
    }
  }

  console.log('\n===============================================================');
  console.log('🎉 EVALUASI AKSESIBILITAS SELESAI!');
  console.log(`📊 Total titik terproses : ${processedCount} / ${activities.length}`);
  if (processedCount > 0) {
    console.log(`⭐ Rata-rata Skor Bintang: ${(totalOverallScore / processedCount).toFixed(2)} / 5.0`);
    console.log(`🎯 Rata-rata Keyakinan AI: ${((totalConfidence / processedCount) * 100).toFixed(1)}%`);
    // Angka di bawah berasal dari kolom usage pada setiap respons OpenAI, bukan
    // perkalian tarif per titik. Biaya sebenarnya naik-turun mengikuti jumlah
    // dan ukuran foto tiap aktivitas, jadi perkiraan tetap bisa meleset jauh.
    console.log(`💰 ${ringkasanPemakaian(processedCount)}`);
  }
  console.log('===============================================================\n');
}

runOpenAiScoring()
  .catch((err) => {
    console.error('Fatal error saat scoring:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
