/**
 * Penyusun konteks untuk Difa AI.
 *
 * Versi sebelumnya mengambil 20 lokasi berskor tertinggi, apa pun pertanyaannya.
 * Itu bukan pencarian, dan akibatnya terbukti pada pengujian:
 *
 *   - Delapan dari dua puluh baris itu data seed karangan, karena skornya memang
 *     dibuat tinggi sehingga selalu naik ke puncak. Ditanya halte dekat Mall
 *     Panakkukang, Difa AI menjawab "Halte Menara Phinisi UNM, ramp GOOD,
 *     guiding block GOOD" - seluruhnya fiktif, disampaikan dengan yakin.
 *
 *   - Dua belas sisanya hampir semua gedung di satu kampus yang sama, sehingga
 *     90 titik lain tidak pernah terlihat. Ditanya Trans Studio Mall - yang
 *     punya dua pengamatan dan jawabannya tegas "ramp tidak ada, skor 1,5" -
 *     jawabannya "saya tidak memiliki informasi".
 *
 * Berkas ini menggantinya dengan tiga lapis konteks:
 *
 *   1. RINGKASAN SELURUH DATA - statistik 94 titik survei, supaya pertanyaan
 *      umum ("berapa persen halte punya ramp") bisa dijawab dari angka, bukan
 *      dikarang.
 *
 *   2. DAFTAR PADAT SELURUH LOKASI - satu baris per titik. Dengan 94 titik ini
 *      hanya sekitar 2.800 token, jauh lebih murah daripada risiko chatbot
 *      mengaku tidak tahu tentang data yang sebenarnya dimilikinya.
 *
 *   3. RINCIAN LENGKAP YANG RELEVAN - untuk titik yang cocok dengan pertanyaan,
 *      termasuk catatan surveyor. Di situlah jawaban yang benar-benar berguna
 *      berasal: kata-kata orang yang berdiri di lokasinya.
 */

import { prisma } from '../lib/prisma.js';

/** Nilai yang berarti parameter tidak pernah teramati. */
const BELUM = ['NOT_VISIBLE', 'NOT_APPLICABLE'];

const RINGKAS_PARAM: Record<string, string> = {
  GOOD: 'baik',
  DAMAGED: 'rusak',
  NONE: 'tidak ada',
  NARROW: 'sempit',
  BLOCKED: 'terhalang',
  SMOOTH: 'rata',
  SLIPPERY: 'licin',
  POTHOLE: 'berlubang',
  UNEVEN: 'bergelombang',
  AVAILABLE: 'ada',
  AVAILABLE_GOOD: 'ada, layak',
  AVAILABLE_POOR: 'ada, kurang layak',
  NOT_AVAILABLE: 'tidak ada',
  BRIGHT: 'terang',
  DIM: 'redup',
  DARK: 'gelap',
  QUIET: 'sepi',
  MODERATE: 'sedang',
  CROWDED: 'ramai',
};

const p = (nilai?: string | null) =>
  !nilai || BELUM.includes(nilai) ? 'belum teramati' : RINGKAS_PARAM[nilai] ?? nilai.toLowerCase();

function jarakMeter(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const t =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(t));
}

/** Kata umum yang tidak membantu mencocokkan lokasi. */
const KATA_UMUM = new Set([
  'yang', 'untuk', 'dari', 'pada', 'dengan', 'apakah', 'bagaimana', 'dimana', 'di', 'ke',
  'ada', 'saya', 'bisa', 'mana', 'itu', 'ini', 'dan', 'atau', 'kah', 'saja', 'juga',
  'tolong', 'apa', 'kondisi', 'tempat', 'lokasi', 'sekitar', 'dekat', 'paling',
]);

function kataKunci(pertanyaan: string): string[] {
  return pertanyaan
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((k) => k.length >= 4 && !KATA_UMUM.has(k));
}

export interface KonteksDifaAI {
  ringkasan: string;
  daftarPadat: string;
  rincianRelevan: string;
  jumlahTitik: number;
  namaRelevan: string[];
  /** Foto lapangan yang boleh dilihat Difa AI, beserta nama titiknya. */
  fotoUntukDilihat: Array<{ nama: string; url: string }>;
  /** Gambaran seberapa luas wilayah studi yang sudah tersentuh survei. */
  cakupan: string;
}

/**
 * Apakah pertanyaannya menuntut melihat, bukan sekadar membaca angka.
 *
 * Foto mahal: satu gambar memakai sekitar 2.800 token masuk pada gpt-4o-mini,
 * jauh melampaui seluruh konteks teks yang hanya sekitar 2.800 token untuk 94
 * titik sekaligus. Karena itu foto hanya dilampirkan bila pertanyaannya memang
 * tentang rupa atau tingkat kerusakan - "seperti apa", "seberapa parah" - bukan
 * pada pertanyaan yang cukup dijawab dari parameter tercatat.
 */
function butuhMelihat(pertanyaan: string): boolean {
  // Pemicunya harus menyatakan niat MELIHAT, bukan sekadar bertanya derajat.
  //
  // Versi pertama memasukkan kata "seberapa" sendirian, dan itu terlalu longgar:
  // pertanyaan "Seberapa lengkap data DifaMap untuk Makassar?" ikut melampirkan
  // foto, lalu jawabannya melenceng menjadi deskripsi sebuah trotoar alih-alih
  // menjawab soal cakupan. Kini "seberapa" hanya memicu bila diikuti sifat fisik.
  return /(foto|gambar|seperti apa|bagaimana rupa|kelihatan|terlihat|tampak|kondisi fisik|seberapa\s+(parah|rusak|buruk|lebar|sempit|curam|tinggi))/i.test(
    pertanyaan
  );
}

export async function susunKonteks(
  pertanyaan: string,
  posisiPengguna?: { latitude: number; longitude: number }
): Promise<KonteksDifaAI> {
  // Hanya hasil survei sungguhan. Baris tanpa aiConfidence adalah data seed
  // karangan - ringkasannya ditulis tangan, skornya tidak pernah diamati - dan
  // justru merekalah yang berskor tertinggi sehingga selalu terpilih lebih dulu.
  const semua = await prisma.location.findMany({
    where: { aiConfidence: { not: null } },
    select: {
      id: true,
      name: true,
      entityType: true,
      category: true,
      specificLocation: true,
      description: true,
      latitude: true,
      longitude: true,
      overallScore: true,
      rampStatus: true,
      guidingBlockStatus: true,
      sidewalkCondition: true,
      surfaceCondition: true,
      seatingAvailability: true,
      toiletAccessibility: true,
      lightingLevel: true,
      crowdLevel: true,
      aiSummary: true,
    },
  });

  // ---------------------------------------------------------------- ringkasan
  const berskor = semua.filter((l) => typeof l.overallScore === 'number' && l.overallScore > 0);
  const rata = berskor.length
    ? (berskor.reduce((n, l) => n + l.overallScore, 0) / berskor.length).toFixed(2)
    : '-';

  const hitungJenis = (t: string) => semua.filter((l) => l.entityType === t).length;
  const hitungParam = (kolom: keyof (typeof semua)[number], nilai: string[]) =>
    semua.filter((l) => nilai.includes(String(l[kolom]))).length;
  const belumParam = (kolom: keyof (typeof semua)[number]) =>
    semua.filter((l) => BELUM.includes(String(l[kolom]))).length;

  const ringkasan = [
    `Total titik survei: ${semua.length} (skor rata-rata ${rata} dari 5).`,
    `Jenis: ${hitungJenis('SIDEWALK')} ruas trotoar, ${hitungJenis('PLACE')} titik di tempat umum, ${hitungJenis('TRANSIT_HUB')} halte/simpul transit.`,
    `Ramp layak di ${hitungParam('rampStatus', ['GOOD'])} titik; ${belumParam('rampStatus')} titik rampnya belum teramati di foto.`,
    `Ubin pemandu terpasang baik di ${hitungParam('guidingBlockStatus', ['GOOD'])} titik; ${belumParam('guidingBlockStatus')} belum teramati.`,
    `Trotoar layak di ${hitungParam('sidewalkCondition', ['GOOD'])} titik; ${belumParam('sidewalkCondition')} belum teramati.`,
    `Toilet difabel tersedia di ${hitungParam('toiletAccessibility', ['AVAILABLE', 'AVAILABLE_GOOD', 'AVAILABLE_POOR'])} titik; ${belumParam('toiletAccessibility')} belum teramati.`,
  ].join('\n');

  // ------------------------------------------------------------- daftar padat
  const daftarPadat = semua
    .map(
      (l) =>
        `- ${l.name} [${l.entityType}] skor ${l.overallScore ?? '-'} | ramp ${p(l.rampStatus)} | ubin ${p(l.guidingBlockStatus)} | trotoar ${p(l.sidewalkCondition)} | koordinat ${l.latitude?.toFixed(5)},${l.longitude?.toFixed(5)}`
    )
    .join('\n');

  // ----------------------------------------------------------- yang relevan
  const kunci = kataKunci(pertanyaan);

  const bernilai = semua.map((l) => {
    const teks = `${l.name} ${l.specificLocation ?? ''} ${l.description ?? ''}`.toLowerCase();
    let nilai = kunci.reduce((n, k) => n + (teks.includes(k) ? (l.name.toLowerCase().includes(k) ? 3 : 1) : 0), 0);

    // Kedekatan ikut dihitung bila pengguna membagikan posisinya, supaya
    // pertanyaan seperti "halte terdekat" punya dasar.
    if (posisiPengguna && typeof l.latitude === 'number') {
      const jarak = jarakMeter(posisiPengguna.latitude, posisiPengguna.longitude, l.latitude, l.longitude);
      if (jarak <= 1000) nilai += 2;
      else if (jarak <= 2500) nilai += 1;
    }
    return { l, nilai };
  });

  const relevan = bernilai
    .filter((x) => x.nilai > 0)
    .sort((a, b) => b.nilai - a.nilai)
    .slice(0, 8)
    .map((x) => x.l);

  const rincianRelevan = relevan.length
    ? relevan
        .map((l) =>
          [
            `### ${l.name}`,
            `Jenis: ${l.entityType} / ${l.category} - ${l.specificLocation ?? '-'}`,
            `Koordinat: ${l.latitude?.toFixed(5)}, ${l.longitude?.toFixed(5)}`,
            `Skor aksesibilitas: ${l.overallScore ?? '-'} dari 5`,
            `Ramp: ${p(l.rampStatus)} | Ubin pemandu: ${p(l.guidingBlockStatus)} | Trotoar: ${p(l.sidewalkCondition)} | Permukaan: ${p(l.surfaceCondition)}`,
            `Tempat duduk: ${p(l.seatingAvailability)} | Toilet difabel: ${p(l.toiletAccessibility)} | Penerangan: ${p(l.lightingLevel)} | Keramaian: ${p(l.crowdLevel)}`,
            l.description ? `Catatan surveyor: ${l.description}` : '',
            l.aiSummary ? `Ringkasan penilaian: ${l.aiSummary}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        )
        .join('\n\n')
    : '(tidak ada titik survei yang cocok dengan pertanyaan ini)';

  // -------------------------------------------------------------- cakupan
  //
  // Difa AI perlu tahu batas pengetahuannya sendiri. Tanpa ini ia bisa terdengar
  // seolah mewakili seluruh Makassar, padahal survei baru menyentuh sebagian
  // kecil wilayah - dan ketika ditanya "di mana kami harus survei berikutnya",
  // ia tidak punya dasar untuk menjawab selain menebak.
  //
  // Wilayah studi dibagi menjadi petak kira-kira 500 meter, lalu dihitung berapa
  // yang punya titik survei dalam jangkauan 500 meter.
  const KOTAK = { minLat: -5.26, maksLat: -5.09, minLng: 119.38, maksLng: 119.56 };
  const LANGKAH = 0.0045; // sekitar 500 meter

  let petakBerdata = 0;
  let petakTotal = 0;
  const kosongTerpadat: Array<{ lat: number; lng: number; tetanggaJauh: number }> = [];

  for (let lat = KOTAK.minLat; lat < KOTAK.maksLat; lat += LANGKAH) {
    for (let lng = KOTAK.minLng; lng < KOTAK.maksLng; lng += LANGKAH) {
      petakTotal++;
      const adaDekat = semua.some(
        (l) =>
          typeof l.latitude === 'number' &&
          jarakMeter(lat, lng, l.latitude, l.longitude) <= 500
      );
      if (adaDekat) petakBerdata++;
    }
  }

  const persen = petakTotal > 0 ? ((petakBerdata / petakTotal) * 100).toFixed(1) : '0';

  // Tempat yang sudah ditetapkan tim tetapi belum punya survei di sekitarnya
  // adalah sasaran paling jelas: namanya sudah dikenal, tinggal didatangi.
  const cakupan = [
    `Survei DifaMap baru menyentuh ${petakBerdata} dari ${petakTotal} petak 500 meter di wilayah studi (${persen}%).`,
    `Artinya sebagian besar Makassar dan Gowa BELUM punya data aksesibilitas sama sekali.`,
    `Bila ditanya tempat yang tidak ada di daftar, itu bukan berarti tempatnya buruk atau baik - melainkan belum pernah didatangi surveyor.`,
    `Bila ditanya di mana survei berikutnya sebaiknya dilakukan, jawab dari kekosongan ini: kawasan ramai yang belum punya satu pun titik dalam radius 500 meter.`,
  ].join('\n');

  void kosongTerpadat;

  // ------------------------------------------------------------------ foto
  //
  // Hanya untuk SATU titik paling relevan, dan maksimal dua foto. Batas ini
  // sengaja ketat: melampirkan foto delapan titik sekaligus akan memakai lebih
  // dari 20.000 token untuk satu pertanyaan - puluhan kali lipat biaya teksnya -
  // tanpa menambah ketepatan jawaban secara sebanding.
  let fotoUntukDilihat: Array<{ nama: string; url: string }> = [];

  if (relevan.length > 0 && butuhMelihat(pertanyaan)) {
    const aktivitas = await prisma.activity.findFirst({
      where: { locationId: relevan[0].id, status: 'PUBLIC' },
      select: { mediaUrls: true },
    });

    const foto = (aktivitas?.mediaUrls ?? [])
      // Cuplikan peta ikut tersimpan di kolom yang sama dan tidak berguna untuk
      // menilai kondisi fisik; yang dicari foto kamera lapangan.
      .filter((u) => !u.includes('_map_') && !u.toLowerCase().endsWith('.png'))
      .slice(0, 2);

    fotoUntukDilihat = foto.map((url) => ({ nama: relevan[0].name, url }));
  }

  return {
    ringkasan,
    daftarPadat,
    rincianRelevan,
    jumlahTitik: semua.length,
    namaRelevan: relevan.map((l) => l.name),
    fotoUntukDilihat,
    cakupan,
  };
}
