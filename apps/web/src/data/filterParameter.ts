/**
 * Penyaring berdasarkan parameter aksesibilitas yang benar-benar tercatat.
 *
 * Sengaja BUKAN penyaring berbasis jenis disabilitas seperti "ramah kursi roda".
 * Label semacam itu adalah tafsiran kita atas beberapa parameter sekaligus, dan
 * tafsiran itu bisa keliru: sebuah titik bisa punya ramp bagus tetapi trotoar
 * menuju ke sana terputus. Menyebutnya "ramah kursi roda" lalu menjadi janji
 * yang tidak bisa ditepati data.
 *
 * Yang disaring di sini adalah fakta yang tercatat apa adanya - ada ramp, ada
 * ubin pemandu - dan pengguna sendiri yang menggabungkannya sesuai kebutuhannya.
 *
 *
 * TENTANG "BELUM TERAMATI"
 *
 * Parameter bernilai NOT_VISIBLE berarti tidak terlihat di foto survei, bukan
 * berarti tidak ada. Titik seperti itu TIDAK diloloskan penyaring - kita tidak
 * bisa menjanjikan ada ramp di tempat yang rampnya tidak pernah terlihat -
 * tetapi jumlahnya disebutkan kepada pengguna, supaya hasil yang sedikit tidak
 * terbaca sebagai "memang tidak ada" padahal artinya "belum disurvei".
 */

export interface DefinisiFilter {
  kunci: string;
  label: string;
  /** Kolom pada baris lokasi. */
  kolom: string;
  /** Nilai yang dianggap memenuhi. */
  lolos: string[];
}

export const FILTER_PARAMETER: DefinisiFilter[] = [
  { kunci: 'ramp', label: 'Ada ramp', kolom: 'rampStatus', lolos: ['GOOD'] },
  { kunci: 'ubin', label: 'Ada ubin pemandu', kolom: 'guidingBlockStatus', lolos: ['GOOD'] },
  { kunci: 'trotoar', label: 'Trotoar layak', kolom: 'sidewalkCondition', lolos: ['GOOD'] },
  { kunci: 'permukaan', label: 'Permukaan rata', kolom: 'surfaceCondition', lolos: ['SMOOTH'] },
  { kunci: 'duduk', label: 'Ada tempat duduk', kolom: 'seatingAvailability', lolos: ['AVAILABLE', 'AVAILABLE_GOOD', 'AVAILABLE_POOR'] },
  { kunci: 'toilet', label: 'Ada toilet difabel', kolom: 'toiletAccessibility', lolos: ['AVAILABLE', 'AVAILABLE_GOOD', 'AVAILABLE_POOR'] },
  { kunci: 'terang', label: 'Penerangan memadai', kolom: 'lightingLevel', lolos: ['BRIGHT'] },
];

const BELUM_TERAMATI = ['NOT_VISIBLE', 'NOT_APPLICABLE'];

/** Apakah satu lokasi memenuhi sebuah penyaring. */
export function memenuhi(lokasi: any, def: DefinisiFilter): boolean {
  return def.lolos.includes(lokasi?.[def.kolom]);
}

/** Beberapa penyaring sekaligus digabung dengan DAN, bukan ATAU. */
export function saringLokasi(daftar: any[], aktif: string[]): any[] {
  if (aktif.length === 0) return daftar;
  const dipilih = FILTER_PARAMETER.filter((f) => aktif.includes(f.kunci));
  return daftar.filter((l) => dipilih.every((f) => memenuhi(l, f)));
}

/**
 * Berapa titik yang lolos tiap penyaring, dan berapa yang parameternya belum
 * pernah teramati. Ditampilkan di panel penyaring supaya pengguna tahu sebelum
 * memilih - tanpa itu, memilih "Ada toilet difabel" mengosongkan peta tanpa
 * penjelasan, padahal sebabnya hanya satu titik yang pernah diamati.
 */
export function hitungFilter(daftar: any[]): Record<string, { lolos: number; belumTeramati: number }> {
  const hasil: Record<string, { lolos: number; belumTeramati: number }> = {};
  for (const f of FILTER_PARAMETER) {
    hasil[f.kunci] = {
      lolos: daftar.filter((l) => memenuhi(l, f)).length,
      belumTeramati: daftar.filter((l) => !l?.[f.kolom] || BELUM_TERAMATI.includes(l[f.kolom])).length,
    };
  }
  return hasil;
}
