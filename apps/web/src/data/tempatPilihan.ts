/**
 * Daftar tempat yang ditentukan tim.
 *
 * Tempat BERDIRI SENDIRI, bukan hasil penyaringan data survei. Seluruh baris di
 * tabel locations adalah pengamatan lapangan - termasuk yang bertipe PLACE,
 * seperti "Toilet Cinema XXI Trans Studio Mall" - dan tidak satu pun mewakili
 * sebuah tempat. Mall dan rumah sakitnya sendiri tidak pernah tersimpan sebagai
 * baris. Pengamatan hanya diambil menurut radius ketika panel tempat dibuka.
 *
 *
 * DASAR PEMILIHAN
 *
 * Daftar ini disusun dari kepadatan pengamatan yang nyata, bukan dari daftar
 * tempat terkenal. Versi sebelumnya memuat Nipah Park, Phinisi Point, Anjungan
 * Losari, Masjid 99 Kubah, dan Kawasan CPI - semuanya berakhir kosong, nol
 * pengamatan bahkan dalam radius 500 m. Koordinatnya berasal dari data seed
 * karangan, dan tim memang tidak pernah mensurvei di sana. Tempat yang tidak
 * bisa dinilai tidak berguna di peta; kelimanya dikeluarkan sampai ada surveinya.
 *
 * Koordinat setiap tempat diambil dari pusat sebaran titik GPS surveyor yang
 * berdiri di sekitarnya, jadi berasal dari pengukuran lapangan. Ditulis tetap di
 * sini supaya letaknya tidak bergeser setiap ada laporan baru masuk.
 *
 * Menambah tempat cukup satu baris. Sebelum menambah, pastikan ada pengamatan di
 * sekitarnya - kalau tidak, pinnya akan kosong saat dibuka.
 */

export interface DefinisiTempat {
  nama: string;
  /** Menentukan lambang di peta; lihat JALUR_IKON di MapCanvas. */
  kategori: 'MALL' | 'HEALTHCARE' | 'EDUCATION' | 'TOURISM' | 'BUS_STOP' | 'HOTEL' | 'OFFICE' | 'OTHER';
  latitude: number;
  longitude: number;
  /**
   * Dipakai HANYA untuk mengenali pengamatan mana yang dianggap bagian dari
   * tempat ini pada angka di pin. Tidak menentukan letak maupun keberadaan pin -
   * isi panel tetap diambil menurut radius dari koordinat di atas.
   */
  kataKunci: RegExp;
}

/** Angka dalam kurung: jumlah pengamatan dalam radius 500 m saat daftar disusun. */
export const TEMPAT_PILIHAN: DefinisiTempat[] = [
  // --- Gowa ---
  { nama: 'Kampus Teknik Unhas Gowa', kategori: 'EDUCATION', latitude: -5.231121, longitude: 119.502307, kataKunci: /teknik unhas|teknik gowa|gedung (elektro|sipil|arsitektur|csa|classroom)/i }, // (16)
  { nama: 'Puskesmas Bontomarannu', kategori: 'HEALTHCARE', latitude: -5.2315, longitude: 119.50415, kataKunci: /bontomarannu/i }, // (16)
  { nama: 'RSUD Syekh Yusuf Gowa', kategori: 'HEALTHCARE', latitude: -5.2013, longitude: 119.4512, kataKunci: /syekh yusuf/i }, // (1)

  // --- Makassar pusat ---
  { nama: 'Kawasan Karebosi & Balai Kota', kategori: 'OFFICE', latitude: -5.13421, longitude: 119.40932, kataKunci: /karebosi|balai kota|kantor pos|taman macan/i }, // (7)
  { nama: 'Pasar Maricaya', kategori: 'OTHER', latitude: -5.149211, longitude: 119.423572, kataKunci: /maricaya|jl\.? rusa/i }, // (6)
  { nama: 'Kawasan Jl. Arief Rate', kategori: 'TOURISM', latitude: -5.144692, longitude: 119.412258, kataKunci: /arief rate|taman segitiga|rajawali/i }, // (3)

  // --- Makassar selatan & timur ---
  { nama: 'Mall Ratu Indah', kategori: 'MALL', latitude: -5.152648, longitude: 119.41695, kataKunci: /ratu indah|\bmari\b/i }, // (6)
  { nama: 'RS Labuang Baji', kategori: 'HEALTHCARE', latitude: -5.162745, longitude: 119.41755, kataKunci: /labuang baji|tvri|politeknik muhammadiyah/i }, // (6)
  { nama: 'Mall Panakkukang', kategori: 'MALL', latitude: -5.156774, longitude: 119.446498, kataKunci: /panakkukang|panakukang/i }, // (3)
  { nama: 'Kawasan Minasa Upa', kategori: 'OTHER', latitude: -5.17893, longitude: 119.462896, kataKunci: /minasa upa|citraland|aroepala/i }, // (3)
  { nama: 'Koridor Hertasning', kategori: 'BUS_STOP', latitude: -5.1644, longitude: 119.442, kataKunci: /hertasning/i }, // (2)
  { nama: 'RS Grestelina', kategori: 'HEALTHCARE', latitude: -5.168027, longitude: 119.454055, kataKunci: /grestelina/i }, // (2)
  { nama: 'Trans Studio Mall', kategori: 'MALL', latitude: -5.160593, longitude: 119.394285, kataKunci: /trans studio/i }, // (2)

  // --- Makassar utara ---
  { nama: 'Kawasan GOR & Pintu 0 Unhas', kategori: 'EDUCATION', latitude: -5.134425, longitude: 119.48529, kataKunci: /universitas hasanuddin|unhas tamalanrea|danau unhas|pintu 0|gor unhas|galigo/i }, // (5)
  { nama: 'RSUP Dr. Wahidin Sudirohusodo', kategori: 'HEALTHCARE', latitude: -5.13455, longitude: 119.4952, kataKunci: /wahidin/i }, // (2)
];

export interface TempatTerhitung {
  nama: string;
  kategori: DefinisiTempat['kategori'];
  latitude: number;
  longitude: number;
  /** Pengamatan survei yang dianggap bagian dari tempat ini; boleh kosong. */
  anggota: any[];
  /** Rata-rata skor anggota, null bila belum ada pengamatan atau belum dinilai. */
  skorRata: number | null;
}

/**
 * Menyusun tempat untuk digambar di peta.
 *
 * Pengamatan hanya DIKAITKAN untuk mengisi angka pada pin, dan tetap digambar
 * sendiri di peta sebagai titik survei. Satu pengamatan hanya dikaitkan ke satu
 * tempat, definisi terdahulu menang - tanpa itu kawasan yang saling bertumpang
 * tindih akan menghitung pengamatan yang sama berkali-kali.
 */
export function susunTempat(pengamatan: any[]): TempatTerhitung[] {
  const sudahDiklaim = new Set<string>();
  const tempat: TempatTerhitung[] = [];

  for (const def of TEMPAT_PILIHAN) {
    const anggota = pengamatan.filter(
      (p) => !sudahDiklaim.has(p.id) && typeof p.name === 'string' && def.kataKunci.test(p.name)
    );
    anggota.forEach((a) => sudahDiklaim.add(a.id));

    const berskor = anggota
      .map((a) => a.overallScore)
      .filter((s: any) => typeof s === 'number') as number[];

    tempat.push({
      nama: def.nama,
      kategori: def.kategori,
      latitude: def.latitude,
      longitude: def.longitude,
      anggota,
      skorRata: berskor.length ? berskor.reduce((x, y) => x + y, 0) / berskor.length : null,
    });
  }

  return tempat;
}
