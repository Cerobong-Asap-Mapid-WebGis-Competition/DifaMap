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
  /**
   * Seberapa luas isokron ini yang benar-benar tersentuh survei.
   *
   * Skor 4,5 dari satu titik di dalam 1,1 km persegi bukan hal yang sama dengan
   * skor 4,5 dari dua belas titik. Tanpa angka ini, keduanya tampil identik di
   * panel - dan yang pertama terbaca jauh lebih meyakinkan daripada seharusnya.
   */
  /**
   * Titik yang, bila diperbaiki, paling mengubah keadaan dari sini.
   *
   * Yang disimulasikan adalah PARAMETER TERCATAT - ramp, ubin pemandu, trotoar,
   * permukaan, penerangan - bukan jaringan jalannya. Kita tidak bisa menyuruh
   * layanan rute menganggap sebuah trotoar sudah diperbaiki, jadi jangkauan
   * isokronnya tidak ikut berubah. Yang berubah adalah hambatan yang hilang,
   * dan apakah sebuah kebutuhan menjadi terpenuhi di dalam jangkauan.
   */
  skenario: Array<{
    nama: string;
    jenis: string;
    menit: number | null;
    jarakMeter: number;
    skor: number | null;
    hambatan: string[];
    dampak: string[];
    nilaiDampak: number;
  }>;
  cakupanIsokron: {
    persen: number;
    petakBerdata: number;
    petakTotal: number;
    radiusUjiMeter: number;
  } | null;
  wawasan: {
    ringkasan: string;
    temuan: string[];
    /** Satu perbaikan yang paling mengubah keadaan, dijelaskan apa adanya. */
    perbaikan: string;
    catatan: string;
  } | null;
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
      perbaikan: {
        type: 'string',
        description:
          'Dua sampai tiga kalimat tentang SATU perbaikan yang paling mengubah keadaan dari titik ini. Sebut nama titiknya, hambatan yang hilang, dan apa yang berubah bagi pengguna. Katakan juga bahwa jangkauan isokron TIDAK ikut dihitung ulang - yang disimulasikan hanya parameter tercatat. Bila tidak ada calon perbaikan, katakan itu.',
      },
      catatan: {
        type: 'string',
        description:
          'Satu kalimat tentang batas kesimpulan ini: berapa titik yang mendasarinya, dan apa yang belum terdata.',
      },
    },
    required: ['ringkasan', 'temuan', 'perbaikan', 'catatan'],
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

6. Bagian "perbaikan" adalah SIMULASI parameter tercatat, bukan ramalan. Titik
   yang diperbaiki akan kehilangan hambatan yang tercatat di situ, dan sebuah
   kebutuhan bisa menjadi terpenuhi di dalam jangkauan. Yang TIDAK berubah
   adalah bentuk isokronnya: layanan rute tidak tahu trotoar itu sudah
   diperbaiki, jadi jangan mengatakan jangkauannya bertambah luas atau waktu
   tempuhnya berkurang.
`.trim();

export async function analisisTitik(
  latitude: number,
  longitude: number,
  moda: ModaJalan = 'wheelchair',
  menitPita: number[] = [5, 10, 15],
  opsi?: { wawasan?: boolean }
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

  /**
   * Cakupan survei di dalam isokron terbesar.
   *
   * Wilayahnya ditaburi titik uji berjarak sekitar 150 meter; yang jatuh di
   * dalam poligon dihitung sebagai petak, dan petak dianggap "berdata" bila ada
   * titik survei dalam 250 meter darinya. Angka kasar, tetapi jauh lebih jujur
   * daripada diam - dan perbandingannya antar titik analisis tetap sahih karena
   * cara hitungnya sama persis.
   */
  const hitungCakupan = (): AnalisisTitik['cakupanIsokron'] => {
    const luar = poligon[poligon.length - 1];
    const RADIUS_UJI = 250;

    // Tanpa poligon nyata, batasnya lingkaran radius dan hasilnya akan
    // menyesatkan - lebih baik tidak melaporkan apa pun.
    if (!luar) return null;

    const lngs = luar.cincin.map((c) => c[0]);
    const lats = luar.cincin.map((c) => c[1]);
    const langkahLat = 150 / 111320;
    const langkahLng = langkahLat / Math.cos((latitude * Math.PI) / 180);

    let petakTotal = 0;
    let petakBerdata = 0;

    for (let la = Math.min(...lats); la <= Math.max(...lats); la += langkahLat) {
      for (let ln = Math.min(...lngs); ln <= Math.max(...lngs); ln += langkahLng) {
        if (!didalamPoligon(la, ln, luar.cincin)) continue;
        petakTotal++;

        const ada = semua.some(
          (l) =>
            typeof l.latitude === 'number' &&
            jarakMeter(la, ln, l.latitude, l.longitude) <= RADIUS_UJI
        );
        if (ada) petakBerdata++;
      }
    }

    if (petakTotal === 0) return null;

    return {
      persen: parseFloat(((petakBerdata / petakTotal) * 100).toFixed(1)),
      petakBerdata,
      petakTotal,
      radiusUjiMeter: RADIUS_UJI,
    };
  };

  const cakupanIsokron = hitungCakupan();

  /**
   * Titik mana yang, bila diperbaiki, paling mengubah keadaan dari sini.
   *
   * Hambatan dihitung dari parameter yang BENAR-BENAR tercatat bermasalah.
   * "Belum teramati" tidak dihitung sebagai hambatan - memperbaiki sesuatu yang
   * tidak pernah terlihat bukan perbaikan, melainkan tebakan.
   *
   * Bobot jarak membuat titik dekat lebih berarti daripada titik jauh: yang
   * berada dalam lima menit dilewati hampir semua orang yang berangkat dari
   * sini, sementara yang di pita lima belas menit hanya sebagian.
   */
  const MASALAH: Array<{ kolom: string; buruk: string[]; sebutan: string }> = [
    { kolom: 'rampStatus', buruk: ['NONE', 'DAMAGED'], sebutan: 'ramp tidak layak' },
    { kolom: 'guidingBlockStatus', buruk: ['NONE', 'DAMAGED'], sebutan: 'ubin pemandu rusak atau tidak ada' },
    { kolom: 'sidewalkCondition', buruk: ['DAMAGED', 'BLOCKED', 'NARROW'], sebutan: 'trotoar rusak, sempit, atau terhalang' },
    { kolom: 'surfaceCondition', buruk: ['SLIPPERY', 'POTHOLE', 'UNEVEN'], sebutan: 'permukaan tidak rata' },
    { kolom: 'lightingLevel', buruk: ['DIM', 'DARK'], sebutan: 'penerangan kurang' },
  ];

  const bobotPita = (menit: number | null): number => {
    if (menit === null) return 0;
    if (menit <= 5) return 3;
    if (menit <= 10) return 2;
    return 1;
  };

  // Kebutuhan yang saat ini BELUM terpenuhi di dalam jangkauan - hanya untuk
  // itulah sebuah perbaikan bisa membuka sesuatu yang baru.
  const belumTerpenuhi = terdekat.filter((t) => !t.didalamJangkauan).map((t) => t.kebutuhan);

  const skenario = didalam
    .map((x) => {
      const l: any = x.l;

      const hambatan = MASALAH.filter((m) => m.buruk.includes(String(l[m.kolom]))).map((m) => m.sebutan);
      if (hambatan.length === 0) return null;

      const dampak: string[] = [
        `${hambatan.length} hambatan tercatat hilang di titik ini`,
      ];

      /**
       * Trotoar yang diperbaiki bisa menjadikan "trotoar layak" tersedia di
       * dalam jangkauan - dan itu perubahan yang benar-benar dirasakan, bukan
       * sekadar angka yang naik.
       */
      const jadiTrotoarLayak =
        l.entityType === 'SIDEWALK' &&
        belumTerpenuhi.some((k) => k.startsWith('Trotoar yang layak'));

      if (jadiTrotoarLayak) {
        const sekarang = terdekat.find((t) => t.kebutuhan.startsWith('Trotoar yang layak'));
        dampak.push(
          `trotoar layak menjadi tersedia dalam ${x.menit} menit (kini terdekat ${
            sekarang?.jarakMeter ?? '-'
          } m, di luar jangkauan)`
        );
      }

      // Titik terburuk di pitanya menekan skor rata-rata paling dalam.
      const sepita = didalam.filter((y) => y.menit === x.menit);
      const terburukSepita =
        sepita.length > 1 &&
        typeof l.overallScore === 'number' &&
        sepita.every(
          (y: any) => typeof y.l.overallScore !== 'number' || y.l.overallScore >= l.overallScore
        );

      if (terburukSepita) {
        dampak.push(`titik berskor terendah di pita ${x.menit} menit`);
      }

      const nilaiDampak =
        hambatan.length * bobotPita(x.menit) + (jadiTrotoarLayak ? 4 : 0) + (terburukSepita ? 2 : 0);

      return {
        nama: l.name as string,
        jenis: l.entityType as string,
        menit: x.menit,
        jarakMeter: x.jarak,
        skor: (l.overallScore ?? null) as number | null,
        hambatan,
        dampak,
        nilaiDampak,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.nilaiDampak - a.nilaiDampak)
    .slice(0, 5);

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
    cakupanIsokron,
    skenario,
    wawasan: null,
  };

  // Dilewati saat titik ini hanya dipakai sebagai bahan perbandingan: di sana
  // yang dibutuhkan satu putusan atas KEDUANYA, bukan dua uraian terpisah yang
  // masing-masing tidak tahu ada pembandingnya.
  if (opsi?.wawasan !== false) {
    hasil.wawasan = await susunWawasan(hasil);
  }

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
    a.cakupanIsokron
      ? `\nCakupan survei di dalam jangkauan: ${a.cakupanIsokron.persen}% wilayahnya punya titik survei dalam ${a.cakupanIsokron.radiusUjiMeter} meter. Bila angka ini rendah, katakan bahwa sebagian besar jangkauan ini belum pernah didatangi surveyor.`
      : '',
    a.skenario.length > 0
      ? [
          '',
          'CALON PERBAIKAN, diurutkan dari yang paling besar pengaruhnya. Angka pengaruh sudah dihitung dari jumlah hambatan, kedekatan, dan apakah perbaikan itu membuka kebutuhan yang kini belum terpenuhi:',
          ...a.skenario.map(
            (k, i) =>
              `  ${i + 1}. ${k.nama} (skor ${k.skor ?? '-'}, ${k.jarakMeter} m, pita ${k.menit} menit)\n` +
              `     hambatan sekarang: ${k.hambatan.join('; ')}\n` +
              `     bila diperbaiki: ${k.dampak.join('; ')}`
          ),
        ].join('\n')
      : '\nTidak ada titik dengan hambatan tercatat di dalam jangkauan, jadi tidak ada calon perbaikan yang bisa disimulasikan.',
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


/* ========================================================================== */
/* PEMBANDINGAN DUA TITIK                                                     */
/* ========================================================================== */

const SKEMA_BANDING = {
  name: 'putusan_banding',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      unggul: {
        type: 'string',
        enum: ['A', 'B', 'SEIMBANG'],
        description:
          'Titik mana yang lebih baik untuk penyandang disabilitas. SEIMBANG bila selisihnya tidak berarti atau datanya terlalu tipis untuk memutuskan.',
      },
      ringkasan: {
        type: 'string',
        description:
          'Dua sampai empat kalimat: mana yang dipilih dan mengapa, dengan angka. Bila SEIMBANG, katakan apa yang membuatnya tidak bisa diputuskan.',
      },
      alasan: {
        type: 'array',
        description: 'Dua sampai empat perbandingan pendek, masing-masing menyebut kedua titik.',
        items: { type: 'string' },
      },
      catatan: {
        type: 'string',
        description:
          'Satu kalimat tentang batas kesimpulan ini: berapa titik survei yang mendasari masing-masing, dan berapa cakupan datanya.',
      },
    },
    required: ['unggul', 'ringkasan', 'alasan', 'catatan'],
    additionalProperties: false,
  },
} as const;

const ATURAN_BANDING = `
Anda membandingkan dua calon lokasi memakai data survei aksesibilitas DifaMap
di Kota Makassar dan Kabupaten Gowa.

ATURAN YANG TIDAK BOLEH DILANGGAR

1. Hanya pakai angka dan nama yang diberikan.

2. Cakupan survei menentukan seberapa jauh kesimpulan boleh melangkah. Titik
   dengan skor bagus dari dua pengamatan TIDAK otomatis mengalahkan titik
   berskor sedang dari dua belas pengamatan - sebutkan ketimpangan itu, dan
   pilih SEIMBANG bila memang belum bisa diputuskan.

3. Yang menentukan bukan hanya skor rata-rata, melainkan apa yang benar-benar
   terjangkau. Titik yang punya halte layak dalam sepuluh menit lebih berguna
   daripada titik berskor sedikit lebih tinggi tetapi terkurung tanpa transit.

4. Bahasa Indonesia, lugas. Sebut titiknya "Titik A" dan "Titik B", dan
   sertakan nama daerahnya bila ada.
`.trim();

export interface PutusanBanding {
  unggul: 'A' | 'B' | 'SEIMBANG';
  ringkasan: string;
  alasan: string[];
  catatan: string;
}

export interface HasilBanding {
  a: AnalisisTitik;
  b: AnalisisTitik;
  putusan: PutusanBanding | null;
}

/** Merangkum satu titik menjadi beberapa baris untuk bahan perbandingan. */
function ringkasUntukBanding(label: string, a: AnalisisTitik): string {
  const pita = a.pita
    .map((q) => `    ${q.menit} menit: ${q.jumlahTitik} titik, skor rata-rata ${q.skorRata ?? 'belum ada'}${q.luasKm2 != null ? `, luas ${q.luasKm2.toFixed(2)} km2` : ''}`)
    .join('\n');

  const terdekat = a.terdekat
    .map((t) =>
      t.nama === null
        ? `    ${t.kebutuhan}: tidak ada di seluruh data survei`
        : `    ${t.kebutuhan}: ${t.nama} (skor ${t.skor ?? '-'}), ${t.jarakMeter} m, ${
            t.didalamJangkauan ? 'DI DALAM jangkauan' : 'DI LUAR jangkauan'
          }`
    )
    .join('\n');

  return [
    `Titik ${label}${a.namaWilayah ? ` - daerah ${a.namaWilayah}` : ''}, koordinat ${a.koordinat.latitude.toFixed(5)},${a.koordinat.longitude.toFixed(5)}`,
    `  Jangkauan${a.isokronNyata ? ' (jaringan jalan)' : ' (lingkaran radius, layanan isokron tidak tersedia)'}:`,
    pita,
    `  Terdekat per kebutuhan:`,
    terdekat,
    a.cakupanIsokron
      ? `  Cakupan survei di dalam jangkauan: ${a.cakupanIsokron.persen}% wilayahnya punya titik survei terdekat dalam ${a.cakupanIsokron.radiusUjiMeter} m.`
      : `  Cakupan survei di dalam jangkauan: tidak dapat dihitung.`,
  ].join('\n');
}

/**
 * Menganalisis dua titik lalu memutuskan mana yang lebih layak.
 *
 * Uraian per titik sengaja dilewati - yang dibutuhkan satu putusan atas
 * KEDUANYA, bukan dua paragraf terpisah yang masing-masing tidak tahu ada
 * pembandingnya. Itu juga menghemat satu panggilan model dari tiga menjadi satu.
 */
export async function bandingkanTitik(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  moda: ModaJalan = 'wheelchair',
  menitPita: number[] = [5, 10, 15]
): Promise<HasilBanding> {
  const [hasilA, hasilB] = await Promise.all([
    analisisTitik(a.latitude, a.longitude, moda, menitPita, { wawasan: false }),
    analisisTitik(b.latitude, b.longitude, moda, menitPita, { wawasan: false }),
  ]);

  const pesan = [
    `Moda: ${moda === 'walking' ? 'jalan kaki' : 'kursi roda'}.`,
    '',
    ringkasUntukBanding('A', hasilA),
    '',
    ringkasUntukBanding('B', hasilB),
  ].join('\n');

  let putusan: PutusanBanding | null = null;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema: SKEMA_BANDING as any },
      messages: [
        { role: 'system', content: ATURAN_BANDING },
        { role: 'user', content: pesan },
      ],
      temperature: 0.3,
      max_tokens: 900,
    });

    catatPemakaian('banding-titik', response.usage);

    const isi = response.choices[0]?.message?.content;
    if (isi) putusan = JSON.parse(isi) as PutusanBanding;
  } catch (err: any) {
    console.warn('[titik] putusan banding gagal disusun:', err.message);
  }

  return { a: hasilA, b: hasilB, putusan };
}
