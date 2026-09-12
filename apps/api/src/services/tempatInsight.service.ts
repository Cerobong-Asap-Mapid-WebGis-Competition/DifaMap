/**
 * Wawasan Difa AI untuk satu tempat usaha atau properti hasil survei MAPID.
 *
 *
 * DUA SUMBER YANG BERBEDA SIFATNYA
 *
 * Titik Properti Go dan Menu Go mencatat tempatnya sendiri - jenis, menu utama,
 * harga, ramai atau tidaknya saat didatangi - tetapi TIDAK pernah mencatat satu
 * pun parameter aksesibilitas. Sementara titik survei DifaMap mencatat ramp,
 * ubin pemandu, dan trotoar, tetapi tidak tahu apa-apa tentang usaha di
 * atasnya.
 *
 * Yang berguna justru pertemuan keduanya: "kafe ini ramai dan harganya
 * terjangkau, tetapi trotoar menuju ke sana tertutup parkir di tiga titik".
 * Tidak ada satu pun sumber yang bisa mengatakan itu sendirian.
 *
 * Batas antara keduanya ditegaskan di aturan model: apa yang diketahui tentang
 * tempatnya, dan apa yang hanya diketahui tentang sekitarnya, tidak boleh
 * tertukar.
 */

import { prisma } from '../lib/prisma.js';
import { openai } from '../lib/openai.js';
import { catatPemakaian } from '../lib/aiUsage.js';

function jarakMeter(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Parameter yang dilaporkan sebagai lambang di panel, beserta arti nilainya. */
export const PARAMETER: Array<{
  kunci: string;
  kolom: string;
  label: string;
  ada: string[];
  tiada: string[];
}> = [
  { kunci: 'ramp', kolom: 'rampStatus', label: 'Ramp kursi roda', ada: ['GOOD'], tiada: ['NONE', 'DAMAGED'] },
  { kunci: 'ubin', kolom: 'guidingBlockStatus', label: 'Ubin pemandu', ada: ['GOOD'], tiada: ['NONE', 'DAMAGED'] },
  { kunci: 'trotoar', kolom: 'sidewalkCondition', label: 'Kondisi trotoar', ada: ['GOOD'], tiada: ['NARROW', 'DAMAGED', 'BLOCKED'] },
  { kunci: 'permukaan', kolom: 'surfaceCondition', label: 'Permukaan jalan', ada: ['SMOOTH'], tiada: ['SLIPPERY', 'POTHOLE', 'UNEVEN'] },
  { kunci: 'duduk', kolom: 'seatingAvailability', label: 'Tempat duduk', ada: ['AVAILABLE', 'AVAILABLE_GOOD', 'AVAILABLE_POOR'], tiada: ['NOT_AVAILABLE'] },
  { kunci: 'toilet', kolom: 'toiletAccessibility', label: 'Toilet difabel', ada: ['AVAILABLE', 'AVAILABLE_GOOD', 'AVAILABLE_POOR'], tiada: ['NOT_AVAILABLE'] },
  { kunci: 'terang', kolom: 'lightingLevel', label: 'Penerangan jalan', ada: ['BRIGHT'], tiada: ['DIM', 'DARK'] },
];

export interface WawasanTempat {
  nama: string;
  jenis: string;
  radiusMeter: number;
  jumlahTitik: number;
  skorRata: number | null;
  /** Status tiap parameter: 'ada', 'tiada', atau 'belum' (tidak teramati). */
  parameter: Array<{ kunci: string; label: string; status: 'ada' | 'tiada' | 'belum'; jumlah: number }>;
  wawasan: { ringkasan: string; temuan: string[]; catatan: string } | null;
}

const SKEMA = {
  name: 'wawasan_tempat',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      ringkasan: {
        type: 'string',
        description:
          'Dua sampai tiga kalimat yang menggabungkan sifat tempatnya dengan kondisi aksesibilitas di sekitarnya. Sebutkan angka. Bahasa Indonesia.',
      },
      temuan: {
        type: 'array',
        description: 'Dua sampai tiga temuan pendek untuk calon pengunjung berkursi roda atau tunanetra.',
        items: { type: 'string' },
      },
      catatan: {
        type: 'string',
        description: 'Satu kalimat tentang batas kesimpulan ini: berapa titik survei yang mendasarinya.',
      },
    },
    required: ['ringkasan', 'temuan', 'catatan'],
    additionalProperties: false,
  },
} as const;

const ATURAN = `
Anda menjelaskan satu tempat usaha atau properti di Kota Makassar / Kabupaten
Gowa, memakai dua sumber yang sifatnya berbeda.

ATURAN YANG TIDAK BOLEH DILANGGAR

1. Data TEMPAT berasal dari survei MAPID: jenis, menu, harga, ramai atau
   tidaknya. Data AKSESIBILITAS berasal dari titik survei DifaMap di
   sekitarnya - BUKAN dari tempat ini sendiri. Jangan pernah menukar keduanya,
   dan jangan mengatakan tempat ini punya ramp atau ubin pemandu; yang Anda
   tahu hanyalah kondisi di sekitarnya.

2. "Belum teramati" berarti tidak terlihat di foto survei - bukan berarti
   fasilitasnya tidak ada. Jangan disimpulkan menjadi ada maupun tidak ada.

3. Bila hanya sedikit titik survei yang mendasari, sebutkan di catatan.

4. Tulis untuk calon pengunjung berkursi roda atau tunanetra yang sedang
   menimbang apakah akan ke sana. Lugas, tanpa jargon, bahasa Indonesia.

5. Jangan menganjurkan perbaikan kepada pemilik tempat - ini bukan laporan
   audit, melainkan keterangan bagi pengunjung.
`.trim();

const NILAI = (v: unknown) => String(v ?? '').trim();

export async function wawasanTempatEkonomi(
  id: string,
  radiusMeter = 500
): Promise<WawasanTempat | null> {
  const titik = await prisma.economicPoint.findUnique({ where: { id } });
  if (!titik) return null;

  const semua = await prisma.location.findMany({
    where: { aiConfidence: { not: null } },
  });

  const dekat = semua.filter(
    (l: any) =>
      typeof l.latitude === 'number' &&
      jarakMeter(titik.latitude, titik.longitude, l.latitude, l.longitude) <= radiusMeter
  );

  const berskor = dekat
    .map((l: any) => l.overallScore)
    .filter((x: any): x is number => typeof x === 'number' && x > 0);

  const skorRata = berskor.length
    ? parseFloat((berskor.reduce((a, b) => a + b, 0) / berskor.length).toFixed(2))
    : null;

  const parameter = PARAMETER.map((p) => {
    const jumlahAda = dekat.filter((l: any) => p.ada.includes(String(l[p.kolom]))).length;
    const jumlahTiada = dekat.filter((l: any) => p.tiada.includes(String(l[p.kolom]))).length;

    // Yang lebih banyak teramati yang menentukan; bila tak satu pun parameter
    // itu terlihat di foto survei, statusnya tetap "belum" - bukan "tidak ada".
    const status: 'ada' | 'tiada' | 'belum' =
      jumlahAda === 0 && jumlahTiada === 0 ? 'belum' : jumlahAda >= jumlahTiada ? 'ada' : 'tiada';

    return { kunci: p.kunci, label: p.label, status, jumlah: jumlahAda + jumlahTiada };
  });

  const m = (titik.metadata ?? {}) as Record<string, any>;

  const sifatTempat = [
    ['nama_tempat', 'Nama'],
    ['jenis_tempat', 'Jenis'],
    ['menu_utama', 'Menu utama'],
    ['harga_rata_rata', 'Harga rata-rata'],
    ['kondisi_tempat', 'Kondisi saat disurvei'],
    ['kategori_properti', 'Kategori properti'],
    ['jenis_properti', 'Status properti'],
  ]
    .filter(([k]) => NILAI(m[k as string]).length > 0)
    .map(([k, label]) => `  ${label}: ${NILAI(m[k as string])}`)
    .join('\n');

  const barisParameter = parameter
    .map(
      (p) =>
        `  ${p.label}: ${
          p.status === 'belum'
            ? 'belum teramati di foto survei'
            : p.status === 'ada'
              ? `terpantau ada / layak (${p.jumlah} titik teramati)`
              : `terpantau tidak ada / bermasalah (${p.jumlah} titik teramati)`
        }`
    )
    .join('\n');

  const namaTerburuk = [...dekat]
    .filter((l: any) => typeof l.overallScore === 'number')
    .sort((a: any, b: any) => a.overallScore - b.overallScore)
    .slice(0, 3)
    .map((l: any) => `${l.name} (skor ${l.overallScore})`)
    .join('; ');

  const pesan = [
    `TEMPAT (survei MAPID, tentang tempat ini sendiri):`,
    sifatTempat || '  (tidak ada catatan survei untuk tempat ini)',
    '',
    `AKSESIBILITAS DI SEKITARNYA (titik survei DifaMap dalam radius ${radiusMeter} meter - BUKAN tentang tempat ini sendiri):`,
    `  Jumlah titik survei: ${dekat.length}`,
    `  Skor aksesibilitas rata-rata: ${skorRata ?? 'belum ada'} dari skala 5`,
    barisParameter,
    namaTerburuk ? `  Titik terburuk di sekitarnya: ${namaTerburuk}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let wawasan: WawasanTempat['wawasan'] = null;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema: SKEMA as any },
      messages: [
        { role: 'system', content: ATURAN },
        { role: 'user', content: pesan },
      ],
      temperature: 0.3,
      max_tokens: 700,
    });

    catatPemakaian('wawasan-tempat', response.usage);

    const isi = response.choices[0]?.message?.content;
    if (isi) wawasan = JSON.parse(isi);
  } catch (err: any) {
    console.warn('[tempat] wawasan gagal disusun:', err.message);
  }

  return {
    nama: NILAI(m.nama_tempat) || titik.name,
    jenis: titik.type,
    radiusMeter,
    jumlahTitik: dekat.length,
    skorRata,
    parameter,
    wawasan,
  };
}
