/**
 * Daftar tempat yang ditentukan tim, bukan disimpulkan dari data.
 *
 * Tabel locations berisi PENGAMATAN survei, bukan tempat: "Toilet Cinema XXI
 * Trans Studio Mall" adalah satu titik di dalam mall, bukan mallnya. Dua cara
 * menurunkan nama tempat secara otomatis sudah dicoba dan keduanya gagal:
 *
 *   - Kesamaan kata antar pengamatan menghasilkan nama tak bermakna seperti
 *     "Unhas Dilengkapi" dan "Teknik".
 *   - Pengelompokan menurut jarak saja menyatukan hal yang tak berhubungan,
 *     misalnya "Halte Bus RS Grestelina" dengan "Bus Stop SD Katolik Santo
 *     Aloysius".
 *
 * POI basemap MAPID memberi nama yang benar, tetapi hanya untuk POI yang sedang
 * tampil di layar - di bawah zoom 14 tidak ada satu pun. Daftar di bawah ini
 * bekerja pada semua tingkat zoom.
 *
 * Tempat BERDIRI SENDIRI, bukan hasil penyaringan data survei. Seluruh 108 baris
 * di tabel locations adalah pengamatan lapangan - termasuk yang bertipe PLACE -
 * dan tidak satu pun mewakili sebuah tempat. Mall dan rumah sakitnya sendiri
 * tidak pernah tersimpan sebagai baris.
 *
 * Karena itu setiap tempat di sini punya koordinatnya sendiri, dan tetap muncul
 * di peta walau belum ada satu pun survei di sekitarnya - keadaan yang justru
 * berguna, karena menandai sasaran survei berikutnya.
 *
 * Menambah tempat cukup satu baris di sini.
 */

export interface DefinisiTempat {
  nama: string;
  /** Menentukan lambang di peta; lihat JALUR_IKON di MapCanvas. */
  kategori: 'MALL' | 'HEALTHCARE' | 'EDUCATION' | 'TOURISM' | 'BUS_STOP' | 'HOTEL' | 'OFFICE' | 'OTHER';
  /**
   * Letak tempat itu sendiri.
   *
   * Diturunkan dari titik GPS surveyor yang berdiri di lokasi tersebut, jadi
   * angkanya berasal dari pengukuran lapangan - bukan dikarang. Ditulis tetap
   * di sini supaya tempat berdiri sendiri: ia tetap ada di peta walau kelak
   * pengamatannya dihapus, dan letaknya tidak bergeser setiap kali ada laporan
   * baru masuk.
   */
  latitude: number;
  longitude: number;
  /**
   * Dipakai HANYA untuk mengenali pengamatan mana yang berada di tempat ini
   * ketika panelnya dibuka. Tidak menentukan letak maupun keberadaan pin.
   */
  kataKunci: RegExp;
}

export const TEMPAT_PILIHAN: DefinisiTempat[] = [
  { nama: 'Trans Studio Mall', kategori: 'MALL', latitude: -5.160593, longitude: 119.394285, kataKunci: /trans studio/i },
  { nama: 'Mall Ratu Indah', kategori: 'MALL', latitude: -5.153782, longitude: 119.416868, kataKunci: /ratu indah|\bmari\b/i },
  { nama: 'Mall Panakkukang', kategori: 'MALL', latitude: -5.156774, longitude: 119.446498, kataKunci: /panakkukang|panakukang/i },
  { nama: 'Nipah Park', kategori: 'MALL', latitude: -5.13781, longitude: 119.44892, kataKunci: /nipah/i },
  { nama: 'Phinisi Point Mall', kategori: 'MALL', latitude: -5.1524, longitude: 119.4081, kataKunci: /phinisi point|\bpipo\b/i },

  { nama: 'Kampus Teknik Unhas Gowa', kategori: 'EDUCATION', latitude: -5.231121, longitude: 119.502307, kataKunci: /teknik unhas|teknik gowa|gedung (elektro|sipil|arsitektur|csa|classroom)/i },
  { nama: 'Universitas Hasanuddin Tamalanrea', kategori: 'EDUCATION', latitude: -5.136879, longitude: 119.488753, kataKunci: /universitas hasanuddin|unhas tamalanrea|danau unhas|pintu 0/i },

  { nama: 'RSUP Dr. Wahidin Sudirohusodo', kategori: 'HEALTHCARE', latitude: -5.13455, longitude: 119.4952, kataKunci: /wahidin/i },
  { nama: 'RSUD Syekh Yusuf Gowa', kategori: 'HEALTHCARE', latitude: -5.2013, longitude: 119.4512, kataKunci: /syekh yusuf/i },
  { nama: 'RS Grestelina', kategori: 'HEALTHCARE', latitude: -5.168027, longitude: 119.454055, kataKunci: /grestelina/i },
  { nama: 'Puskesmas Bontomarannu', kategori: 'HEALTHCARE', latitude: -5.2315, longitude: 119.50415, kataKunci: /bontomarannu/i },

  { nama: 'Anjungan Pantai Losari', kategori: 'TOURISM', latitude: -5.142086, longitude: 119.405841, kataKunci: /losari|penghibur/i },
  { nama: 'Masjid 99 Kubah CPI', kategori: 'TOURISM', latitude: -5.1501, longitude: 119.4035, kataKunci: /99 kubah/i },
  { nama: 'Kawasan CPI', kategori: 'TOURISM', latitude: -5.15125, longitude: 119.4058, kataKunci: /\bcpi\b/i },

  { nama: 'Halte Karebosi', kategori: 'BUS_STOP', latitude: -5.13421, longitude: 119.40932, kataKunci: /karebosi/i },
];

export interface TempatTerhitung {
  nama: string;
  kategori: DefinisiTempat['kategori'];
  latitude: number;
  longitude: number;
  /** Pengamatan survei yang berada di tempat ini; boleh kosong. */
  anggota: any[];
  /** Rata-rata skor anggota, null bila belum ada pengamatan atau belum dinilai. */
  skorRata: number | null;
}

/**
 * Menyusun tempat untuk digambar di peta.
 *
 * Tempat BERDIRI SENDIRI, terpisah dari data survei. Seluruh 108 baris di tabel
 * locations adalah pengamatan lapangan - termasuk yang bertipe PLACE, seperti
 * "Toilet Cinema XXI Trans Studio Mall" dan "Gedung Elektro Unhas". Tidak satu
 * pun di antaranya mewakili sebuah tempat; mall dan rumah sakitnya sendiri tidak
 * pernah tersimpan sebagai baris.
 *
 * Karena itu daftar tempat tidak disaring dari pengamatan: ia ditulis tim, punya
 * koordinatnya sendiri, dan tetap muncul di peta walau belum ada satu pun survei
 * di sekitarnya - keadaan itu justru berguna, karena menandai sasaran survei
 * berikutnya.
 *
 * Pengamatan hanya DIKAITKAN untuk mengisi ringkasan panel, dan tetap digambar
 * sendiri di peta sebagai titik survei.
 */
export function susunTempat(pengamatan: any[]): TempatTerhitung[] {
  const sudahDiklaim = new Set<string>();
  const tempat: TempatTerhitung[] = [];

  for (const def of TEMPAT_PILIHAN) {
    // Satu pengamatan hanya dikaitkan ke satu tempat, definisi terdahulu menang.
    // Tanpa itu "Kawasan CPI" ikut mengklaim pengamatan Masjid 99 Kubah yang
    // berada di dalamnya, dan ringkasan keduanya menjadi rancu.
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
