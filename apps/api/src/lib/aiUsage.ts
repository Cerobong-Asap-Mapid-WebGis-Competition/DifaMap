/**
 * Pencatat pemakaian token dan biaya AI.
 *
 * Tujuannya supaya biaya menjadi angka yang terukur, bukan tebakan. Setiap
 * panggilan mencetak token yang benar-benar terpakai beserta perkiraan
 * biayanya, dan totalnya bisa dibaca setelah proses batch selesai.
 *
 * Ini penting untuk DifaMap karena importer memproses 84 titik sekaligus.
 * Tanpa pengukuran, satu-satunya cara tahu biayanya adalah menunggu tagihan.
 */

/**
 * Tarif gpt-4o-mini per 1 juta token, dalam USD.
 * Sumber: platform.openai.com/pricing (dicek 8 September 2026).
 *
 * Tarif berubah dari waktu ke waktu. Kalau angkanya sudah tidak cocok dengan
 * halaman resmi, ganti di sini saja - tidak ada tempat lain yang menyimpannya.
 */
export const TARIF_PER_JUTA_TOKEN = {
  masukan: 0.15,
  /** Prompt sistem yang identik di banyak panggilan dikenai tarif separuh. */
  masukanTerCache: 0.075,
  keluaran: 0.6,
} as const;

export interface PemakaianAI {
  tokenMasuk: number;
  tokenMasukTerCache: number;
  tokenKeluar: number;
  biayaUSD: number;
}

const KOSONG: PemakaianAI = {
  tokenMasuk: 0,
  tokenMasukTerCache: 0,
  tokenKeluar: 0,
  biayaUSD: 0,
};

/** Total berjalan sejak proses dimulai, untuk laporan akhir batch. */
let total: PemakaianAI = { ...KOSONG };

export function hitungBiaya(masuk: number, terCache: number, keluar: number): number {
  // Token ter-cache sudah termasuk dalam prompt_tokens, jadi porsinya dikurangi
  // dari tarif penuh lalu dihitung terpisah dengan tarif cache.
  const masukPenuh = Math.max(0, masuk - terCache);
  return (
    (masukPenuh / 1_000_000) * TARIF_PER_JUTA_TOKEN.masukan +
    (terCache / 1_000_000) * TARIF_PER_JUTA_TOKEN.masukanTerCache +
    (keluar / 1_000_000) * TARIF_PER_JUTA_TOKEN.keluaran
  );
}

/**
 * Mencatat pemakaian satu panggilan AI dan menambahkannya ke total berjalan.
 * `usage` diambil apa adanya dari respons OpenAI; bila kosong, dilewati tanpa
 * menebak - lebih baik tidak ada angka daripada angka karangan.
 */
export function catatPemakaian(label: string, usage: any): PemakaianAI {
  if (!usage) {
    console.warn(`[AI:${label}] respons tidak menyertakan data pemakaian token`);
    return { ...KOSONG };
  }

  const tokenMasuk = usage.prompt_tokens ?? 0;
  const tokenMasukTerCache = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const tokenKeluar = usage.completion_tokens ?? 0;
  const biayaUSD = hitungBiaya(tokenMasuk, tokenMasukTerCache, tokenKeluar);

  total = {
    tokenMasuk: total.tokenMasuk + tokenMasuk,
    tokenMasukTerCache: total.tokenMasukTerCache + tokenMasukTerCache,
    tokenKeluar: total.tokenKeluar + tokenKeluar,
    biayaUSD: total.biayaUSD + biayaUSD,
  };

  console.log(
    `[AI:${label}] masuk ${tokenMasuk}` +
      (tokenMasukTerCache ? ` (${tokenMasukTerCache} ter-cache)` : '') +
      ` · keluar ${tokenKeluar} · ~$${biayaUSD.toFixed(6)}` +
      ` · total sesi ~$${total.biayaUSD.toFixed(4)}`
  );

  return { tokenMasuk, tokenMasukTerCache, tokenKeluar, biayaUSD };
}

export function totalPemakaian(): PemakaianAI {
  return { ...total };
}

export function resetPemakaian(): void {
  total = { ...KOSONG };
}

/** Ringkasan sekali baca untuk ditampilkan setelah proses batch selesai. */
export function ringkasanPemakaian(jumlahPanggilan?: number): string {
  const t = total;
  const rata =
    jumlahPanggilan && jumlahPanggilan > 0
      ? ` · rata-rata $${(t.biayaUSD / jumlahPanggilan).toFixed(6)} per panggilan`
      : '';
  return (
    `Pemakaian AI: ${t.tokenMasuk.toLocaleString('id-ID')} token masuk` +
    (t.tokenMasukTerCache ? ` (${t.tokenMasukTerCache.toLocaleString('id-ID')} ter-cache)` : '') +
    `, ${t.tokenKeluar.toLocaleString('id-ID')} token keluar` +
    ` · total ~$${t.biayaUSD.toFixed(4)}${rata}`
  );
}
