/**
 * Membaca hasil survei MAPID dari sebuah titik Properti Go atau Menu Go.
 *
 * Nama kolomnya mengikuti formulir survei MAPID apa adanya - foto_menu_1,
 * kondisi_tempat, foto_tampak_depan - dan hanya yang benar-benar terisi yang
 * dikembalikan. Empat dari sebelas titik Menu Go dan tujuh dari sepuluh titik
 * Properti Go punya metadata; empat belas titik sisanya hanya koordinat
 * bernama, dan panelnya menampilkan bagian ini kosong alih-alih mengarangnya.
 *
 * Dipisahkan ke berkas sendiri karena dipakai dua tempat: peta, saat pinnya
 * diklik, dan halaman, sebagai jaring pengaman ketika panel POI terbuka lewat
 * jalan lain - misalnya label basemap yang kebetulan menempati titik yang sama.
 * Tanpa jaring itu, foto menu muncul atau hilang tergantung piksel mana yang
 * kebetulan tertekan.
 */

export interface SurveiEkonomi {
  jenis: 'MENU_GO' | 'PROPERTI_GO' | 'COMMERCIAL';
  rincian: Array<{ label: string; nilai: string }>;
  foto: Array<{ label: string; url: string }>;
}

const KOLOM_RINCIAN: Array<[string, string]> = [
  ['nama_tempat', 'Nama tempat'],
  ['jenis_tempat', 'Jenis tempat'],
  ['menu_utama', 'Menu utama'],
  ['harga_rata_rata', 'Harga rata-rata'],
  ['kondisi_tempat', 'Kondisi saat disurvei'],
  ['mobilitas', 'Mobilitas'],
  ['kategori_properti', 'Kategori properti'],
  ['jenis_properti', 'Status properti'],
  ['alamat', 'Alamat'],
];

const KOLOM_FOTO: Array<[string, string]> = [
  ['foto_tempat', 'Tampak tempat'],
  ['foto_menu_1', 'Menu 1'],
  ['foto_menu_2', 'Menu 2'],
  ['foto_tampak_depan', 'Tampak depan'],
  ['foto_spanduk', 'Spanduk'],
];

export function bacaSurveiEkonomi(pt: any): SurveiEkonomi {
  const m = (pt?.metadata ?? {}) as Record<string, any>;
  const teks = (nilai: any) => String(nilai ?? '').trim();

  const rincian = KOLOM_RINCIAN.filter(([k]) => teks(m[k]).length > 0).map(([k, label]) => ({
    label,
    nilai:
      k === 'harga_rata_rata' && !isNaN(Number(m[k]))
        ? `Rp${Number(m[k]).toLocaleString('id-ID')}`
        : teks(m[k]),
  }));

  const foto = KOLOM_FOTO.filter(([k]) => /^https?:\/\//.test(teks(m[k]))).map(([k, label]) => ({
    label,
    url: teks(m[k]),
  }));

  return { jenis: pt?.type ?? 'COMMERCIAL', rincian, foto };
}

/**
 * Mencari titik ekonomi yang menempati koordinat yang sama dengan sebuah POI.
 *
 * Toleransinya sekitar tiga puluh meter: label basemap MAPID dan titik survei
 * kami jarang persis sama koordinatnya walau menunjuk bangunan yang sama.
 */
export function cariTitikEkonomi(
  titik: { latitude: number; longitude: number },
  daftar: any[]
): any | null {
  const TOLERANSI = 0.0003;

  return (
    daftar.find(
      (p) =>
        typeof p?.latitude === 'number' &&
        Math.abs(p.latitude - titik.latitude) < TOLERANSI &&
        Math.abs(p.longitude - titik.longitude) < TOLERANSI
    ) ?? null
  );
}
