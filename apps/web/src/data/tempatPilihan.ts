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
 * Yang ditulis tangan hanya NAMA, KATEGORI, dan KATA KUNCI. Koordinatnya tidak:
 * titik tempat dihitung sebagai pusat massa pengamatan yang cocok dengan kata
 * kuncinya, sehingga selalu mengikuti data dan tidak pernah basi. Tempat yang
 * belum punya satu pun pengamatan tidak akan muncul di peta.
 *
 * Menambah tempat cukup satu baris di sini.
 */

export interface DefinisiTempat {
  nama: string;
  /** Menentukan lambang di peta; lihat JALUR_IKON di MapCanvas. */
  kategori: 'MALL' | 'HEALTHCARE' | 'EDUCATION' | 'TOURISM' | 'BUS_STOP' | 'HOTEL' | 'OFFICE' | 'OTHER';
  /** Dicocokkan ke nama pengamatan, tidak peka huruf besar-kecil. */
  kataKunci: RegExp;
}

export const TEMPAT_PILIHAN: DefinisiTempat[] = [
  { nama: 'Trans Studio Mall', kategori: 'MALL', kataKunci: /trans studio/i },
  { nama: 'Mall Ratu Indah', kategori: 'MALL', kataKunci: /ratu indah|\bmari\b/i },
  { nama: 'Mall Panakkukang', kategori: 'MALL', kataKunci: /panakkukang|panakukang/i },
  { nama: 'Nipah Park', kategori: 'MALL', kataKunci: /nipah/i },
  { nama: 'Phinisi Point Mall', kategori: 'MALL', kataKunci: /phinisi point|\bpipo\b/i },

  { nama: 'Kampus Teknik Unhas Gowa', kategori: 'EDUCATION', kataKunci: /teknik unhas|teknik gowa|gedung (elektro|sipil|arsitektur|csa|classroom)/i },
  { nama: 'Universitas Hasanuddin Tamalanrea', kategori: 'EDUCATION', kataKunci: /universitas hasanuddin|unhas tamalanrea|danau unhas|pintu 0/i },

  { nama: 'RSUP Dr. Wahidin Sudirohusodo', kategori: 'HEALTHCARE', kataKunci: /wahidin/i },
  { nama: 'RSUD Syekh Yusuf Gowa', kategori: 'HEALTHCARE', kataKunci: /syekh yusuf/i },
  { nama: 'RS Grestelina', kategori: 'HEALTHCARE', kataKunci: /grestelina/i },
  { nama: 'Puskesmas Bontomarannu', kategori: 'HEALTHCARE', kataKunci: /bontomarannu/i },

  { nama: 'Anjungan Pantai Losari', kategori: 'TOURISM', kataKunci: /losari|penghibur/i },
  { nama: 'Masjid 99 Kubah CPI', kategori: 'TOURISM', kataKunci: /99 kubah/i },
  { nama: 'Kawasan CPI', kategori: 'TOURISM', kataKunci: /\bcpi\b/i },

  { nama: 'Halte Karebosi', kategori: 'BUS_STOP', kataKunci: /karebosi/i },
];

export interface TempatTerhitung {
  nama: string;
  kategori: DefinisiTempat['kategori'];
  latitude: number;
  longitude: number;
  /** Pengamatan yang menjadi dasar titik ini. */
  anggota: any[];
  /** Rata-rata skor anggota, null bila belum ada yang dinilai. */
  skorRata: number | null;
}

/**
 * Menyusun tempat dari daftar di atas dan pengamatan yang ada.
 *
 * Satu pengamatan hanya boleh menjadi anggota satu tempat: definisi yang lebih
 * dulu di daftar menang. Tanpa aturan itu, "Kawasan CPI" akan ikut mengklaim
 * pengamatan Masjid 99 Kubah yang berada di dalamnya, dan titiknya tertarik
 * menjauh dari letak sebenarnya.
 */
export function susunTempat(pengamatan: any[]): {
  tempat: TempatTerhitung[];
  idTerpakai: Set<string>;
} {
  const idTerpakai = new Set<string>();
  const tempat: TempatTerhitung[] = [];

  for (const def of TEMPAT_PILIHAN) {
    const anggota = pengamatan.filter(
      (p) => !idTerpakai.has(p.id) && typeof p.name === 'string' && def.kataKunci.test(p.name)
    );
    if (anggota.length === 0) continue;

    anggota.forEach((a) => idTerpakai.add(a.id));

    const berskor = anggota
      .map((a) => a.overallScore)
      .filter((s: any) => typeof s === 'number') as number[];

    tempat.push({
      nama: def.nama,
      kategori: def.kategori,
      latitude: anggota.reduce((s, a) => s + a.latitude, 0) / anggota.length,
      longitude: anggota.reduce((s, a) => s + a.longitude, 0) / anggota.length,
      anggota,
      skorRata: berskor.length ? berskor.reduce((x, y) => x + y, 0) / berskor.length : null,
    });
  }

  return { tempat, idTerpakai };
}
