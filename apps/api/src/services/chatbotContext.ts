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
import { hitungRute, hitungBeberapaRute } from './rute.service.js';
import { cariTempat } from './geocode.service.js';

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

/**
 * Jarak sebuah titik ke ruas garis A-B, dalam meter.
 *
 * Dipakai untuk menemukan pengamatan yang berada DI SEPANJANG perjalanan, bukan
 * sekadar dekat salah satu ujungnya. Perhitungannya memakai proyeksi datar -
 * cukup akurat untuk jarak beberapa kilometer di lintang Makassar, dan jauh
 * lebih sederhana daripada geodesi penuh yang ketelitiannya tidak dibutuhkan di
 * sini.
 */
function jarakKeRuas(
  tLat: number, tLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number
): { jarak: number; maju: number } {
  const skalaLng = Math.cos((aLat * Math.PI) / 180);
  const x = (n: number) => n * skalaLng * 111320;
  const y = (n: number) => n * 110540;

  const ax = x(aLng), ay = y(aLat);
  const bx = x(bLng), by = y(bLat);
  const tx = x(tLng), ty = y(tLat);

  const dx = bx - ax, dy = by - ay;
  const panjangKuadrat = dx * dx + dy * dy;

  // Titik awal dan tujuan berimpit: tidak ada ruas untuk diukur.
  if (panjangKuadrat === 0) {
    return { jarak: Math.hypot(tx - ax, ty - ay), maju: 0 };
  }

  const t = Math.max(0, Math.min(1, ((tx - ax) * dx + (ty - ay) * dy) / panjangKuadrat));
  const px = ax + t * dx, py = ay + t * dy;

  return { jarak: Math.hypot(tx - px, ty - py), maju: t };
}

/**
 * Menangkap pertanyaan berbentuk perjalanan: "dari Halte Karebosi ke Balai Kota".
 *
 * Pertanyaan seperti ini paling dekat dengan kebutuhan nyata pengguna kursi
 * roda - yang menentukan bukan kondisi tujuannya saja, melainkan seluruh rantai
 * yang harus dilalui. Satu trotoar terputus di tengah membuat tujuan yang bagus
 * tetap tak tercapai.
 */
function bacaRute(pertanyaan: string): { awal: string; tujuan: string } | null {
  const cocok = pertanyaan.match(/\bdari\s+(.{3,60}?)\s+(?:ke|menuju|sampai)\s+(.{3,60}?)\s*[?.,]?$/i);
  if (!cocok) return null;
  return { awal: cocok[1].trim(), tujuan: cocok[2].trim() };
}

/**
 * Menilai sebuah jalur dengan data survei DifaMap.
 *
 * Inilah yang tidak dimiliki aplikasi peta mana pun: bukan sekadar tahu jalannya
 * lewat mana, tetapi tahu kondisi trotoar di sepanjangnya. Titik survei yang
 * berada dekat jalur dianggap mewakili kondisi ruas itu.
 *
 * Ambangnya 120 meter - cukup dekat untuk benar-benar berada di jalur yang
 * sama, dan tidak selebar koridor 400 meter yang dipakai untuk mengumpulkan
 * konteks umum, yang di sana memang sengaja longgar.
 */
function nilaiJalur(jalur: Array<[number, number]>, pengamatan: any[]) {
  const AMBANG = 120;
  const dekat = pengamatan.filter((l) => {
    if (typeof l.latitude !== 'number') return false;
    for (let i = 0; i < jalur.length - 1; i++) {
      const [aLng, aLat] = jalur[i];
      const [bLng, bLat] = jalur[i + 1];
      if (jarakKeRuas(l.latitude, l.longitude, aLat, aLng, bLat, bLng).jarak <= AMBANG) return true;
    }
    return false;
  });

  const berskor = dekat
    .map((l) => l.overallScore)
    .filter((x: any) => typeof x === 'number' && x > 0) as number[];

  const hambatan = dekat.filter(
    (l) =>
      ['NONE', 'DAMAGED'].includes(l.rampStatus) ||
      ['DAMAGED', 'BLOCKED', 'NARROW'].includes(l.sidewalkCondition)
  );

  return {
    jumlahTitik: dekat.length,
    skorRata: berskor.length ? berskor.reduce((a, b) => a + b, 0) / berskor.length : null,
    jumlahHambatan: hambatan.length,
    namaHambatan: hambatan.slice(0, 3).map((l) => l.name),
  };
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
  /** Hambatan sepanjang koridor, bila pertanyaannya berbentuk "dari A ke B". */
  koridor: string | null;
  /**
   * Jalur rute untuk digambar di peta, bila pertanyaannya berbentuk perjalanan.
   *
   * Dikirim terpisah dari teks jawaban karena keduanya untuk mata yang berbeda:
   * kalimat menjelaskan hambatannya, garis di peta memperlihatkan jalurnya.
   * Membaca "1,5 kilometer" tidak sama dengan melihat jalan mana yang dilewati.
   */
  ruteDigambar: {
    awal: string;
    tujuan: string;
    awalSebenarnya: string;
    tujuanSebenarnya: string;
    jarakMeter: number;
    durasiDetik: number;
    jalur: Array<[number, number]>;
    /**
     * Jalur lain menuju tujuan yang sama, sudah dinilai dengan data survei.
     * Yang pertama adalah yang direkomendasikan - belum tentu yang terpendek.
     */
    pilihan: Array<{
      jarakMeter: number;
      durasiDetik: number;
      jalur: Array<[number, number]>;
      skorRata: number | null;
      jumlahTitik: number;
      jumlahHambatan: number;
      direkomendasikan: boolean;
    }>;
  } | null;
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
  return /(\bfoto\b|\bgambar\b|seperti apa|bagaimana rupa|kelihatan|terlihat|tampak|kondisi fisik|seberapa\s+(parah|rusak|buruk|lebar|sempit|curam|tinggi))/i.test(
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

  // -------------------------------------------------------------- koridor
  let koridor: string | null = null;
  let ruteDigambar: KonteksDifaAI['ruteDigambar'] = null;
  const rute = bacaRute(pertanyaan);

  if (rute) {
    // Kata jenis tempat tidak boleh menjadi satu-satunya dasar kecocokan.
    //
    // Tanpa aturan ini, "Halte Karebosi" - yang titik surveinya memang tidak ada
    // karena baris itu data seed yang sudah disaring - tetap dianggap cocok
    // dengan "Halte Bus Mall Panakkukang", hanya karena sama-sama mengandung
    // kata "halte". Koridor lalu dihitung antara dua tempat yang salah, dan
    // jawabannya membahas perjalanan yang tidak pernah ditanyakan.
    const KATA_JENIS = new Set([
      'halte', 'trotoar', 'jalan', 'mall', 'gedung', 'kawasan', 'kampus',
      'pasar', 'masjid', 'rumah', 'sakit', 'hotel', 'terminal', 'stop', 'bus',
      'depan', 'area', 'koridor', 'jalur', 'pintu',
      // Jenis tempat yang menyusul setelah "Lapangan Karebosi" tercocokkan ke
      // "Lapangan Basket Fakultas Teknik Unhas" - 19 kilometer melesetnya,
      // hanya karena sama-sama berkata "lapangan".
      'lapangan', 'taman', 'pantai', 'anjungan', 'sekolah', 'kantor',
      'stasiun', 'puskesmas', 'universitas', 'fakultas', 'plaza', 'pusat',
      'toko', 'cafe', 'kafe', 'restoran', 'apotek', 'bank', 'bandara',
      'pelabuhan', 'museum', 'benteng', 'perpustakaan', 'kampung',
    ]);

    const cariTitik = (frasa: string) => {
      const kataFrasa = frasa.toLowerCase().split(/\s+/).filter((k) => k.length >= 4);
      const kataKhas = kataFrasa.filter((k) => !KATA_JENIS.has(k));

      // Frasa yang seluruhnya kata jenis - misalnya "halte bus" - tidak cukup
      // menunjuk satu tempat tertentu.
      if (kataKhas.length === 0) return null;

      let terbaik: (typeof semua)[number] | null = null;
      let nilaiTerbaik = 0;

      for (const l of semua) {
        const nama = l.name.toLowerCase();
        const cocokKhas = kataKhas.filter((k) => nama.includes(k)).length;

        // SEMUA kata khas harus ada, bukan sekadar salah satunya.
        //
        // Kecocokan sebagian terlalu mudah tertipu: "Lapangan Karebosi" cukup
        // bertemu kata "lapangan" saja untuk mendarat di lapangan lain di
        // kabupaten sebelah. Bila tidak semua cocok, biarkan kosong - pencarian
        // tempat umum di tahap berikutnya justru lebih andal untuk nama tempat,
        // dan lebih baik menyerahkannya daripada menebak dengan percaya diri.
        if (cocokKhas < kataKhas.length) continue;

        const nilai = cocokKhas * 3 + kataFrasa.filter((k) => KATA_JENIS.has(k) && nama.includes(k)).length;
        if (nilai > nilaiTerbaik) {
          nilaiTerbaik = nilai;
          terbaik = l;
        }
      }

      return terbaik;
    };

    /**
     * Ujung rute dicari dua tahap.
     *
     * Pertama di titik survei, karena namanya paling sesuai dengan istilah yang
     * dipakai di aplikasi. Bila tidak ketemu, dicari sebagai tempat umum lewat
     * layanan pencarian - sebab orang bertanya "dari Puskesmas Bontomarannu",
     * bukan "dari titik survei nomor sekian", dan tempat itu bisa saja memang
     * belum pernah disurvei.
     *
     * Tanpa tahap kedua, pertanyaan perjalanan gagal diam-diam setiap kali salah
     * satu ujungnya adalah tempat yang belum ada di data kita - padahal justru
     * perjalanan ke sanalah yang paling perlu diperingatkan.
     */
    /** Membuang kata tanya yang ikut terbawa pola "dari A ke B". */
    const bersihkan = (frasa: string) =>
      frasa
        .replace(/,.*$/, '')
        .replace(/\b(bagaimana|apa|apakah|untuk|kursi roda|tunanetra|hambatannya|kondisinya|berapa jauh|aksesnya|rutenya)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    const cariUjung = async (frasa: string) => {
      const dariSurvei = cariTitik(frasa);
      if (dariSurvei) {
        return {
          nama: dariSurvei.name,
          latitude: dariSurvei.latitude,
          longitude: dariSurvei.longitude,
          asal: 'survei' as const,
          diminta: bersihkan(frasa) || frasa,
        };
      }

      const bersih = bersihkan(frasa);

      try {
        const hasil = await cariTempat(bersih || frasa, 1);
        if (hasil.length > 0) {
          return {
            nama: hasil[0].nama,
            latitude: hasil[0].latitude,
            longitude: hasil[0].longitude,
            asal: 'peta' as const,
            diminta: bersih || frasa,
          };
        }
      } catch {
        // Pencarian tempat luar adalah pelengkap; kegagalannya tidak boleh
        // menjatuhkan seluruh jawaban.
      }
      return null;
    };

    const a = await cariUjung(rute.awal);
    const b = await cariUjung(rute.tujuan);

    if (a && b && a.nama !== b.nama) {
      const LEBAR_KORIDOR = 400; // meter dari garis lurus penghubung

      const sepanjang = semua
        .map((l) => ({ l, ...jarakKeRuas(l.latitude, l.longitude, a.latitude, a.longitude, b.latitude, b.longitude) }))
        .filter((x) => x.jarak <= LEBAR_KORIDOR)
        .sort((x, y) => x.maju - y.maju);

      const jarakLurus = Math.round(
        jarakMeter(a.latitude, a.longitude, b.latitude, b.longitude)
      );

      // Beberapa jalur sekaligus, lalu dinilai dengan data survei sendiri.
      //
      // Aplikasi peta umum merekomendasikan yang tercepat karena tidak punya
      // data kondisi trotoar per ruas. DifaMap punya - jadi yang terpendek bisa
      // ditolak bila trotoarnya terputus, dan yang lebih jauh direkomendasikan
      // bila jalannya benar-benar bisa dilalui.
      const semuaJalur = await hitungBeberapaRute(
        { latitude: a.latitude, longitude: a.longitude },
        { latitude: b.latitude, longitude: b.longitude },
        'wheelchair',
        3
      );

      const dinilai = semuaJalur.map((r) => ({
        ...r,
        ...nilaiJalur(r.jalur, semua),
      }));

      /**
       * Peringkat jalur.
       *
       * Dua aturan, keduanya berasal dari kekeliruan yang sempat terjadi:
       *
       *  1. Jalur tanpa satu pun titik survei tidak boleh menang. Tanpa ini,
       *     jalur yang belum pernah didatangi siapa pun tampak "bersih dari
       *     hambatan" dan justru direkomendasikan - kebalikan dari yang benar.
       *     Ketiadaan data bukan kabar baik.
       *
       *  2. Memutar hanya dibenarkan bila keuntungannya nyata. Uji pertama
       *     merekomendasikan jalur 284 meter lebih jauh padahal skor keduanya
       *     sama persis - dan model lalu mengarang alasan untuk membenarkannya.
       *     Jadi jalur yang skornya setara dianggap sama baiknya, dan di antara
       *     yang setara dipilih yang terpendek.
       */
      const SELISIH_BERARTI = 0.3; // dalam satuan skor 1-5

      const berbukti = dinilai.filter((r) => r.jumlahTitik > 0 && r.skorRata != null);
      const terpendek = [...dinilai].sort((x, y) => x.jarakMeter - y.jarakMeter)[0];

      let terpilih = terpendek;
      if (berbukti.length > 0) {
        const skorTerbaik = Math.max(...berbukti.map((r) => r.skorRata!));
        const setara = berbukti.filter((r) => skorTerbaik - r.skorRata! <= SELISIH_BERARTI);
        setara.sort((x, y) => x.jarakMeter - y.jarakMeter);
        terpilih = setara[0];
      }

      // Memutar atau tidak - dipakai untuk menjelaskan alasannya apa adanya.
      const memutar = terpilih !== terpendek && terpendek != null;

      const pilihan = dinilai.map((r) => ({
        jarakMeter: r.jarakMeter,
        durasiDetik: r.durasiDetik,
        jalur: r.jalur,
        skorRata: r.skorRata,
        jumlahTitik: r.jumlahTitik,
        jumlahHambatan: r.jumlahHambatan,
        direkomendasikan: r === terpilih,
      }));
      // Yang direkomendasikan ditaruh paling depan supaya peta menggambarnya
      // sebagai jalur utama.
      pilihan.sort((x, y) => Number(y.direkomendasikan) - Number(x.direkomendasikan));

      const rutaNyata = terpilih
        ? { jarakMeter: terpilih.jarakMeter, durasiDetik: terpilih.durasiDetik, jalur: terpilih.jalur }
        : await hitungRute(
            { latitude: a.latitude, longitude: a.longitude },
            { latitude: b.latitude, longitude: b.longitude },
            'wheelchair'
          );

      // Perbandingan antar jalur, untuk dijelaskan Difa AI apa adanya.
      const barisPilihan =
        dinilai.length > 1
          ? [
              `Ada ${dinilai.length} jalur menuju tujuan yang sama. Penilaian tiap jalur memakai titik survei dalam 120 meter dari jalurnya:`,
              ...dinilai
                .sort((x, y) => x.jarakMeter - y.jarakMeter)
                .map((r, i) => {
                  const tanda = r === terpilih ? ' [DIREKOMENDASIKAN]' : '';
                  const dasar =
                    r.jumlahTitik === 0
                      ? 'belum ada satu pun titik survei di sepanjangnya - kondisinya tidak diketahui, bukan berarti baik'
                      : `skor rata-rata ${r.skorRata?.toFixed(2)} dari ${r.jumlahTitik} titik survei, ${r.jumlahHambatan} di antaranya bermasalah${
                          r.namaHambatan.length ? ` (${r.namaHambatan.join('; ')})` : ''
                        }`;
                  return `  Jalur ${i + 1}: ${r.jarakMeter} m, ${Math.round(r.durasiDetik / 60)} menit - ${dasar}${tanda}`;
                }),
              memutar
                ? `Jalur yang direkomendasikan lebih jauh ${terpilih.jarakMeter - terpendek.jarakMeter} meter daripada yang terpendek. Jelaskan bahwa jarak tambahan itu ditempuh demi kondisi jalur yang lebih baik menurut data survei.`
                : `Jalur yang direkomendasikan sekaligus yang terpendek - tidak ada alasan untuk memutar, karena jalur lain tidak terbukti lebih baik. Katakan begitu saja, jangan mencari-cari alasan lain.`,
              `PENTING: angka pada tiap jalur di atas adalah SATU-SATUNYA data per jalur yang kamu punya. Daftar titik survei di bawah berlaku untuk seluruh kawasan antara kedua ujung, BUKAN untuk salah satu jalur tertentu - jangan menempelkan daftar yang sama ke tiap jalur seolah itu rincian masing-masing.`,
            ].join('\n')
          : null;

      if (rutaNyata && rutaNyata.jalur.length > 1) {
        ruteDigambar = {
          // Nama yang DITANYAKAN, bukan nama titik survei yang kebetulan
          // terpilih sebagai pangkalnya. Pengguna bertanya "dari Mall Ratu
          // Indah", dan melihat penanda bertuliskan "Tingkat Keramaian dan
          // Aksesibilitas Area Atrium Mall Ratu Indah" hanya membingungkan -
          // itu nama pengamatan survei, bukan nama tempat.
          awal: a.diminta || a.nama,
          tujuan: b.diminta || b.nama,
          // Nama titik yang sebenarnya dipakai tetap dibawa, untuk keterangan.
          awalSebenarnya: a.nama,
          tujuanSebenarnya: b.nama,
          jarakMeter: rutaNyata.jarakMeter,
          durasiDetik: rutaNyata.durasiDetik,
          jalur: rutaNyata.jalur,
          pilihan,
        };
      }

      const barisJarak = rutaNyata
        ? `Jarak tempuh nyata mengikuti jalan: ${rutaNyata.jarakMeter} meter, sekitar ${Math.round(rutaNyata.durasiDetik / 60)} menit dengan kursi roda (garis lurus hanya ${jarakLurus} meter).`
        : `Jarak lurus sekitar ${jarakLurus} meter. Rute jalan sebenarnya tidak tersedia saat ini, jadi angka ini pasti lebih pendek daripada perjalanan yang sesungguhnya.`;

      // Nama yang diminta bisa berbeda dari yang ditemukan: "Puskesmas
      // Bontomarannu" pernah tercocokkan ke "PUSKESMAS Pakatto". Perbedaan itu
      // harus tersurat, sebab model cenderung memakai ulang kata-kata penanya
      // dan penggantiannya jadi tidak terlihat sama sekali.
      const catatanPenggantian = [a, b]
        .filter((u) => u.asal === 'peta' && u.nama.toLowerCase() !== u.diminta.toLowerCase())
        .map(
          (u) =>
            `CATATAN PENTING: "${u.diminta}" tidak ada di data survei DifaMap. Yang dipakai sebagai titiknya adalah "${u.nama}" dari peta umum - sebutkan perbedaan nama ini kepada pengguna, jangan menyamakannya begitu saja.`
        );

      koridor = [
        `Perjalanan dari "${a.nama}" ke "${b.nama}".`,
        ...catatanPenggantian,
        barisJarak,
        ...(barisPilihan ? [barisPilihan] : []),
        `Titik survei dalam ${LEBAR_KORIDOR} meter dari garis penghubung, diurutkan dari awal ke tujuan:`,
        ...sepanjang.map(
          (x) =>
            `  ${Math.round(x.maju * 100)}% perjalanan - ${x.l.name} (skor ${x.l.overallScore ?? '-'}) | ramp ${p(x.l.rampStatus)} | ubin ${p(x.l.guidingBlockStatus)} | trotoar ${p(x.l.sidewalkCondition)}`
        ),
        sepanjang.length === 0
          ? '  (tidak ada titik survei di sepanjang koridor ini - jalurnya belum pernah didatangi)'
          : rutaNyata
            ? `Perhatian: titik di atas hanya yang berada di dekat garis penghubung kedua ujung. Ruas jalan di antaranya bisa saja belum disurvei sama sekali - jarak tempuh sudah nyata, tetapi kondisi sepanjangnya belum tentu terdata.`
            : `Perhatian: ini garis lurus, bukan rute jalan sebenarnya. Titik di atas hanya yang kebetulan berada di dekat garis itu, dan ruas jalan di antaranya bisa saja belum disurvei sama sekali.`,
      ].join('\n');
    }
  }

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
    koridor,
    ruteDigambar,
  };
}
