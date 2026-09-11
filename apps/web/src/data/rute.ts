/**
 * Bentuk jalur rute yang berpindah dari Difa AI ke peta.
 *
 * Dipisahkan ke berkas sendiri karena dipakai tiga tempat sekaligus - panel
 * percakapan yang menerimanya dari API, halaman yang menyimpannya, dan peta
 * yang menggambarnya. Ketika bentuknya dituliskan ulang di tiap tempat,
 * penambahan satu ruas saja harus disusulkan ke tiga berkas dan satu di
 * antaranya pasti terlewat.
 */
export interface PilihanJalur {
  jarakMeter: number;
  durasiDetik: number;
  jalur: Array<[number, number]>;
  /** Rata-rata skor titik survei di sepanjang jalur; null bila belum terdata. */
  skorRata: number | null;
  jumlahTitik: number;
  jumlahHambatan: number;
  direkomendasikan: boolean;
}

export interface RuteDigambar {
  awal: string;
  tujuan: string;
  /** Jalur yang direkomendasikan, [lng, lat]. */
  jalur: Array<[number, number]>;
  /** Semua jalur yang dipertimbangkan, termasuk yang direkomendasikan. */
  pilihan?: PilihanJalur[];
}
