/**
 * Analisis satu titik: apa yang benar-benar terjangkau, dan seberapa layak.
 *
 *
 * KENAPA PITA WAKTU, BUKAN RADIUS
 *
 * Panel Site Analysis sebelumnya menyaring titik dengan jarak lurus - menit
 * dikali 60 meter - lalu melaporkan berapa banyak yang "terjangkau". Jarak
 * lurus menyeberangi sungai, menembus blok bangunan, dan melebih-lebihkan
 * jangkauan: pada pengujian di Mall Ratu Indah, jangkauan 10 menit kursi roda
 * sesungguhnya berentang sekitar 940 meter, sedangkan lingkarannya menggambarkan
 * 1.200 meter.
 *
 * Di sini titik diuji terhadap poligon isokron yang sesungguhnya, memakai uji
 * titik-dalam-poligon. Sebuah titik yang hanya 300 meter jauhnya tetapi
 * terpisah jalan tol tidak akan terhitung terjangkau - dan memang tidak.
 *
 *
 * YANG DI LUAR JANGKAUAN JUGA TEMUAN
 *
 * Bila tidak ada satu pun halte layak dalam sepuluh menit, itu bukan kegagalan
 * analisis melainkan jawabannya. Karena itu titik terdekat untuk tiap kebutuhan
 * tetap dicari meski berada jauh di luar isokron, lengkap dengan jaraknya -
 * "halte layak terdekat 1,2 km, di luar jangkauan" lebih berguna daripada
 * kolom kosong.
 */

import { prisma } from '../lib/prisma.js';
import { openai } from '../lib/openai.js';
import { catatPemakaian } from '../lib/aiUsage.js';
import { hitungIsokron, type ModaJalan } from './rute.service.js';
import { namaiKoordinat } from './geocode.service.js';

/** Jarak dua koordinat dalam meter. */
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

/**
 * Uji titik-dalam-poligon dengan pancaran sinar.
 *
 * Cincin luar saja yang diperiksa. Isokron OpenRouteService bisa memuat lubang -
 * kawasan yang terkepung jalan tak dapat dilalui - tetapi mengabaikannya membuat
 * jangkauan sedikit terlalu murah hati, bukan terlalu pelit, dan itu arah galat
 * yang lebih aman untuk dilaporkan apa adanya daripada menghilangkan titik yang
 * sebenarnya bisa dicapai.
 */
function didalamPoligon(lat: number, lng: number, cincin: number[][]): boolean {
  let didalam = false;

  for (let i = 0, j = cincin.length - 1; i < cincin.length; j = i++) {
    const [xi, yi] = cincin[i];
    const [xj, yj] = cincin[j];

    const memotong =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (memotong) didalam = !didalam;
  }

  return didalam;
}

export interface TitikTerjangkau {
  nama: string;
  skor: number | null;
  jenis: string;
  jarakMeter: number;
  /** Pita waktu terkecil yang memuat titik ini, dalam menit. */
  menit: number | null;
}

export interface TitikTerdekat {
  kebutuhan: string;
  nama: string | null;
  skor: number | null;
  jarakMeter: number | null;
  didalamJangkauan: boolean;
}

export interface AnalisisTitik {
  namaWilayah: string | null;
  koordinat: { latitude: number; longitude: number };
  moda: ModaJalan;
  isokronNyata: boolean;
  pita: Array<{ menit: number; jumlahTitik: number; skorRata: number | null; luasKm2: number | null }>;
  terjangkau: TitikTerjangkau[];
  terdekat: TitikTerdekat[];
  cakupan: { didalam: number; diluar: number };
  wawasan: { ringkasan: string; temuan: string[]; catatan: string } | null;
}

/**
 * Kolom `category` tidak bisa dipercaya, `entityType` bisa.
 *
 * entityType diisi surveyor lewat formulir - SIDEWALK, PLACE, TRANSIT_HUB -
 * sedangkan category ditebak AI dari foto, dan tebakannya sering meleset. Dari
 * enam baris bercategory HEALTHCARE, hanya SATU yang benar-benar fasilitas
 * kesehatan; sisanya pengamatan guiding block di kawasan mal, gedung arsitektur
 * kampus, dan dua halte bus.
 *
 * Karena itu kebutuhan dicocokkan dari entityType ditambah kata pada namanya -
 * nama ditulis surveyor sendiri, jadi jauh lebih dapat dipercaya daripada
 * kategori hasil tebakan.
 */
const KATA_KESEHATAN = /rumah sakit|\brsud\b|\brsia\b|\brs\b|puskesmas|klinik|apotek|posyandu/i;
const KATA_NIAGA = /\bmall\b|\bmal\b|pasar|restoran|kafe|cafe|warung|kuliner|\btoko\b|minimarket|swalayan/i;

const KEBUTUHAN: Array<{ label: string; cocok: (l: any) => boolean }> = [
  {
    label: 'Halte atau titik transit',
    cocok: (l) => l.entityType === 'TRANSIT_HUB',
  },
  {
    label: 'Fasilitas kesehatan',
    cocok: (l) => l.entityType === 'PLACE' && KATA_KESEHATAN.test(String(l.name)),
  },
  {
    label: 'Tempat makan atau niaga',
    cocok: (l) => l.entityType === 'PLACE' && KATA_NIAGA.test(String(l.name)),
  },
  {
    label: 'Trotoar yang layak (skor 3,5 ke atas)',
    cocok: (l) => l.entityType === 'SIDEWALK' && (l.overallScore ?? 0) >= 3.5,
  },
];

const SKEMA = {
  name: 'wawasan_titik',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      ringkasan: {
        type: 'string',
        description:
          'Dua sampai empat kalimat: apa yang benar-benar terjangkau dari titik ini dengan kursi roda, dan seberapa layak jalannya. Sebutkan angka dan nama titik. Bahasa Indonesia.',
      },
      temuan: {
        type: 'array',
        description: 'Dua sampai empat temuan pendek, masing-masing satu kalimat.',
        items: { type: 'string' },
      },
      catatan: {
        type: 'string',
        description:
          'Satu kalimat tentang batas kesimpulan ini: berapa titik yang mendasarinya, dan apa yang belum terdata.',
      },
    },
    required: ['ringkasan', 'temuan', 'catatan'],
    additionalProperties: false,
  },
} as const;

const ATURAN = `
Anda menjelaskan hasil analisis satu titik di DifaMap, Kota Makassar dan Kabupaten Gowa.

ATURAN YANG TIDAK BOLEH DILANGGAR

1. Hanya pakai angka dan nama yang diberikan. Jangan menyebut fasilitas yang
   tidak ada di data.

2. "Terjangkau" berarti berada di dalam poligon isokron - jangkauan menurut
   jalan yang benar-benar bisa dilalui, bukan jarak lurus.

3. Bila sebuah kebutuhan tidak punya titik di dalam jangkauan, KATAKAN ITU
   sebagai temuan, bukan sebagai data yang hilang. Sebutkan jarak titik
   terdekatnya dan bahwa ia berada di luar jangkauan.

4. Bila hanya sedikit titik survei yang mendasari, sebutkan di catatan.
   Skor bagus dari satu titik tidak sama dengan skor bagus dari dua belas.

5. Bahasa Indonesia, lugas. Jangan menganjurkan perbaikan atas sesuatu yang
   tidak terdata.
`.trim();

export async function analisisTitik(
  latitude: number,
  longitude: number,
  moda: ModaJalan = 'wheelchair',
  menitPita: number[] = [5, 10, 15]
): Promise<AnalisisTitik> {
  const urut = [...menitPita].sort((a, b) => a - b);
  const menitTerbesar = urut[urut.length - 1];

  const isokron = await hitungIsokron({ latitude, longitude }, urut, moda);
  const isokronNyata = Boolean(isokron?.features?.length);

  // Kecepatan cadangan bila isokron sungguhan tidak tersedia.
  const meterPerMenit = moda === 'walking' ? 80 : 60;
  const radiusTerbesar = menitTerbesar * meterPerMenit;

  const semua = await prisma.location.findMany({
    where: { aiConfidence: { not: null } },
    select: {
      name: true,
      latitude: true,
      longitude: true,
      entityType: true,
      category: true,
      overallScore: true,
      rampStatus: true,
      guidingBlockStatus: true,
      sidewalkCondition: true,
    },
  });

  /** Poligon per pita, diurutkan dari yang terkecil. */
  const poligon: Array<{ menit: number; cincin: number[][]; luasKm2: number | null }> = [];

  if (isokron?.features) {
    for (const f of isokron.features) {
      const detik = f?.properties?.value;
      const cincin = f?.geometry?.coordinates?.[0];
      if (typeof detik !== 'number' || !Array.isArray(cincin)) continue;
      poligon.push({
        menit: Math.round(detik / 60),
        cincin,
        luasKm2: typeof f.properties.area === 'number' ? f.properties.area / 1_000_000 : null,
      });
    }
    poligon.sort((a, b) => a.menit - b.menit);
  }

  /** Pita terkecil yang memuat sebuah titik; null bila di luar semuanya. */
  const pitaUntuk = (lat: number, lng: number): number | null => {
    if (poligon.length > 0) {
      for (const q of poligon) {
        if (didalamPoligon(lat, lng, q.cincin)) return q.menit;
      }
      return null;
    }

    // Cadangan lingkaran, dan ini disebutkan ke pengguna lewat isokronNyata.
    const d = jarakMeter(latitude, longitude, lat, lng);
    for (const m of urut) {
      if (d <= m * meterPerMenit) return m;
    }
    return null;
  };

  const berjarak = semua
    .filter((l) => typeof l.latitude === 'number' && typeof l.longitude === 'number')
    .map((l) => ({
      l,
      jarak: Math.round(jarakMeter(latitude, longitude, l.latitude, l.longitude)),
      menit: pitaUntuk(l.latitude, l.longitude),
    }));

  const didalam = berjarak.filter((x) => x.menit !== null);

  const terjangkau: TitikTerjangkau[] = didalam
    .sort((a, b) => (a.menit ?? 99) - (b.menit ?? 99) || a.jarak - b.jarak)
    .map((x) => ({
      nama: x.l.name,
      skor: x.l.overallScore ?? null,
      jenis: x.l.entityType,
      jarakMeter: x.jarak,
      menit: x.menit,
    }));

  const pita = urut.map((m) => {
    const isi = didalam.filter((x) => (x.menit ?? 99) <= m);
    const skor = isi.map((x) => x.l.overallScore).filter((s): s is number => typeof s === 'number' && s > 0);
    return {
      menit: m,
      jumlahTitik: isi.length,
      skorRata: skor.length ? parseFloat((skor.reduce((a, b) => a + b, 0) / skor.length).toFixed(2)) : null,
      luasKm2: poligon.find((q) => q.menit === m)?.luasKm2 ?? null,
    };
  });

  // Titik terdekat untuk tiap kebutuhan - termasuk yang di luar jangkauan.
  const terdekat: TitikTerdekat[] = KEBUTUHAN.map((k) => {
    const calon = berjarak.filter((x) => k.cocok(x.l)).sort((a, b) => a.jarak - b.jarak)[0];
    if (!calon) {
      return { kebutuhan: k.label, nama: null, skor: null, jarakMeter: null, didalamJangkauan: false };
    }
    return {
      kebutuhan: k.label,
      nama: calon.l.name,
      skor: calon.l.overallScore ?? null,
      jarakMeter: calon.jarak,
      didalamJangkauan: calon.menit !== null,
    };
  });

  const namaWilayah = await namaiKoordinat(latitude, longitude);

  const hasil: AnalisisTitik = {
    namaWilayah,
    koordinat: { latitude, longitude },
    moda,
    isokronNyata,
    pita,
    terjangkau: terjangkau.slice(0, 25),
    terdekat,
    cakupan: {
      didalam: didalam.length,
      diluar: berjarak.filter((x) => x.menit === null && x.jarak <= radiusTerbesar).length,
    },
    wawasan: null,
  };

  hasil.wawasan = await susunWawasan(hasil);
  return hasil;
}

async function susunWawasan(a: AnalisisTitik) {
  const barisPita = a.pita
    .map((q) => `  ${q.menit} menit: ${q.jumlahTitik} titik survei, skor rata-rata ${q.skorRata ?? 'belum ada'}`)
    .join('\n');

  const barisTerjangkau = a.terjangkau
    .slice(0, 12)
    .map((t) => `  ${t.nama} - skor ${t.skor ?? '-'} | ${t.jenis} | ${t.jarakMeter} m | pita ${t.menit} menit`)
    .join('\n');

  const barisTerdekat = a.terdekat
    .map((t) =>
      t.nama === null
        ? `  ${t.kebutuhan}: tidak ada satu pun di seluruh data survei`
        : `  ${t.kebutuhan}: ${t.nama} (skor ${t.skor ?? '-'}), ${t.jarakMeter} m, ${
            t.didalamJangkauan ? 'DI DALAM jangkauan' : 'DI LUAR jangkauan'
          }`
    )
    .join('\n');

  const pesan = [
    `Titik analisis${a.namaWilayah ? ` di daerah ${a.namaWilayah}` : ''}, koordinat ${a.koordinat.latitude.toFixed(5)},${a.koordinat.longitude.toFixed(5)}.`,
    `Moda: ${a.moda === 'walking' ? 'jalan kaki' : 'kursi roda'}.`,
    a.isokronNyata
      ? 'Jangkauan dihitung dari jaringan jalan sesungguhnya (isokron OpenRouteService).'
      : 'PERHATIAN: layanan isokron tidak tersedia, jangkauan memakai lingkaran radius. Sebutkan keterbatasan ini.',
    '',
    'Jangkauan per pita waktu:',
    barisPita,
    '',
    `Titik survei yang terjangkau (${a.cakupan.didalam} total, ${a.cakupan.diluar} lainnya dekat tetapi di luar jangkauan):`,
    barisTerjangkau || '  (tidak ada satu pun)',
    '',
    'Titik terdekat untuk tiap kebutuhan:',
    barisTerdekat,
  ].join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema: SKEMA as any },
      messages: [
        { role: 'system', content: ATURAN },
        { role: 'user', content: pesan },
      ],
      temperature: 0.3,
      max_tokens: 900,
    });

    catatPemakaian('wawasan-titik', response.usage);

    const isi = response.choices[0]?.message?.content;
    return isi ? (JSON.parse(isi) as AnalisisTitik['wawasan']) : null;
  } catch (err: any) {
    console.warn('[titik] wawasan gagal disusun:', err.message);
    return null;
  }
}

