/**
 * Penjelasan naratif atas grid prioritas.
 *
 *
 * KENAPA LAPISAN INI ADA
 *
 * Sebelumnya sel grid disertai "rekomendasi" berupa tiga kalimat mati yang
 * dipilih dari ambang angka:
 *
 *   >= 70  "Prioritas Mendesak: Revitalisasi ramp curam dan ubin pengarah..."
 *   >= 45  "Prioritas Menengah: Perbaikan permukaan trotoar & lampu jalan"
 *   lain   "Pemeliharaan rutin trotoar"
 *
 * Akibatnya sel yang tidak punya satu pun data ramp tetap disuruh
 * "revitalisasi ramp curam", dan siapa pun yang membuka dua sel berturut-turut
 * langsung melihat kalimat yang sama persis. Itu bukan wawasan, melainkan
 * templat yang menyamar jadi wawasan.
 *
 * Di sini penjelasannya disusun dari apa yang benar-benar tercatat di tiap sel:
 * nama titiknya, hambatan yang terhitung, kegiatan di sekitarnya. Yang
 * ditemukan model adalah POLA antar sel - bahwa enam sel terparah semuanya di
 * satu koridor, misalnya - dan pola seperti itu tidak muncul dari mewarnai sel
 * satu per satu.
 *
 *
 * SATU PANGGILAN UNTUK SELURUH GRID
 *
 * Sel yang dikirim hanya sepuluh teratas beserta angkanya, bukan seluruh 1.500
 * sel: yang selebihnya tidak mengubah kesimpulan apa pun dan hanya menambah
 * biaya. Kegagalan apa pun mengembalikan null, dan pemanggilnya tetap
 * menampilkan gridnya - penjelasan yang hilang lebih baik daripada grid yang
 * ikut mati.
 */

import { openai } from '../lib/openai.js';
import { catatPemakaian } from '../lib/aiUsage.js';
import type { ModaPenilaian, SiniGridCell } from './mapid.service.js';

const SKEMA = {
  name: 'wawasan_grid',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      ringkasan: {
        type: 'string',
        description:
          'Satu paragraf tentang pola yang terlihat di seluruh grid: di mana prioritas menumpuk, dan hambatan apa yang paling sering berulang. Sebutkan angka. Bahasa Indonesia.',
      },
      sel: {
        type: 'array',
        description: 'Penjelasan untuk tiap sel yang diberikan, urut sesuai urutan masuknya.',
        items: {
          type: 'object',
          properties: {
            gridId: { type: 'string' },
            judul: {
              type: 'string',
              description: 'Tiga sampai enam kata yang menyebut masalah utamanya.',
            },
            alasan: {
              type: 'string',
              description:
                'Dua sampai tiga kalimat: kenapa sel ini berperingkat segitu. WAJIB menyebut nama minimal satu titik survei di sel itu beserta skornya, persis seperti tertulis di data - itu yang membuat kesimpulannya bisa ditelusuri pembaca. Jangan hanya menyebut jumlah.',
            },
            tindakan: {
              type: 'string',
              description:
                'Satu tindakan konkret yang masuk akal dari data sel ini. Jangan menyebut fasilitas yang tidak tercatat.',
            },
          },
          required: ['gridId', 'judul', 'alasan', 'tindakan'],
          additionalProperties: false,
        },
      },
    },
    required: ['ringkasan', 'sel'],
    additionalProperties: false,
  },
} as const;

export interface WawasanGrid {
  ringkasan: string;
  sel: Array<{ gridId: string; judul: string; alasan: string; tindakan: string }>;
}

const JUDUL_MODA: Record<ModaPenilaian, string> = {
  AKSESIBILITAS:
    'Kerentanan aksesibilitas dikali kepadatan kegiatan. Sel bernilai tinggi berarti banyak orang melewatinya sementara kondisinya buruk.',
  HUNIAN:
    'Kerentanan aksesibilitas dikali keberadaan hunian. Sel bernilai tinggi berarti ada tempat tinggal terdata, tetapi jalan menuju transit di sekitarnya buruk atau transitnya belum terdata sama sekali.',
  KOMERSIAL:
    'Kerentanan aksesibilitas dikali kepadatan tempat usaha. Sel bernilai tinggi berarti ada usaha yang terbukti ramai, tetapi lingkungannya belum ramah bagi penyandang disabilitas.',
};

const ATURAN = `
Anda menjelaskan hasil analisis grid DifaMap untuk Kota Makassar dan Kabupaten Gowa.

ATURAN YANG TIDAK BOLEH DILANGGAR

1. Hanya pakai angka dan nama yang tertulis di data sel. Jangan menyebut ramp,
   ubin pemandu, trotoar, atau fasilitas apa pun yang tidak tercatat di sel itu.

2. Bila sebuah sel hanya punya satu atau dua titik survei, katakan bahwa
   penilaiannya bersandar pada sedikit pengamatan. Jangan menyembunyikannya.

3. Jangan menyarankan tindakan atas sesuatu yang tidak terdata. Bila hambatan
   yang tercatat hanya soal ubin pemandu, jangan menganjurkan perbaikan ramp.

4. Cari POLA antar sel untuk ringkasannya - apakah prioritas menumpuk di satu
   koridor, apakah hambatan yang sama berulang di banyak sel. Itu yang tidak
   terlihat dari membaca sel satu per satu.

5. Bahasa Indonesia, lugas, tanpa jargon. Sebutkan angka apa adanya.

6. Sebut sel dengan NAMA DAERAHNYA bila tersedia, bukan kodenya. "Sel di
   Banta-Bantaeng" jauh lebih berguna daripada "MKSR-SINI-137" bagi orang yang
   harus mendatanginya. Kode selnya cukup ditaruh di kolom gridId.

7. Titik yang disebutkan di data adalah titik BERSKOR TERBURUK di sel itu,
   diurutkan dari yang paling buruk. Pakai itu sebagai bukti - jangan menyebut
   sebuah titik sebagai contoh masalah bila skornya justru tinggi.

8. Tiap penjelasan sel WAJIB menyebut nama minimal satu titik beserta skornya,
   disalin persis dari data. "Tiga titik tanpa ramp layak" memberi tahu jumlah;
   "Bus Stop Mega Rezky 1 berskor 1,5" memberi tahu ke mana harus pergi - dan
   hanya yang kedua yang bisa ditelusuri pembaca di peta.
`.trim();

export async function susunWawasanGrid(
  sel: SiniGridCell[],
  moda: ModaPenilaian,
  ringkasanGrid: string
): Promise<WawasanGrid | null> {
  const berdata = sel
    .filter((f) => f.properties.priorityIndex !== null)
    .sort((a, b) => (b.properties.priorityIndex ?? 0) - (a.properties.priorityIndex ?? 0));

  if (berdata.length === 0) return null;

  const teratas = berdata.slice(0, 10);

  const baris = teratas.map((f) => {
    const p = f.properties;
    return [
      `${p.gridId}${p.namaWilayah ? ` (daerah ${p.namaWilayah})` : ''} - prioritas ${p.priorityIndex}`,
      `  skor aksesibilitas rata-rata ${p.accessibilityScore} dari skala 5, dihitung dari ${p.jumlahTitik} titik survei`,
      `  pembentuk nilai: kerentanan ${p.faktor.kerentananAkses} + kepadatan ${p.faktor.kepadatan} (${p.faktor.keterangan})`,
      `  hambatan tercatat: ${p.hambatan.length > 0 ? p.hambatan.join('; ') : 'tidak ada yang tercatat'}`,
      `  titik terburuk di dalamnya: ${p.namaTitik.length > 0 ? p.namaTitik.join('; ') : '-'}`,
      `  koordinat tengah: ${p.center[1].toFixed(4)},${p.center[0].toFixed(4)}`,
    ].join('\n');
  });

  const pesan = [
    `Sudut pandang penilaian: ${moda}.`,
    JUDUL_MODA[moda],
    '',
    `Cakupan: ${ringkasanGrid}`,
    `Seluruh grid punya ${berdata.length} sel yang bisa dinilai. Berikut ${teratas.length} sel berprioritas tertinggi:`,
    '',
    baris.join('\n\n'),
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
      max_tokens: 1600,
    });

    catatPemakaian('wawasan-grid', response.usage);

    const isi = response.choices[0]?.message?.content;
    if (!isi) return null;

    return JSON.parse(isi) as WawasanGrid;
  } catch (err: any) {
    console.warn('[grid] wawasan gagal disusun:', err.message);
    return null;
  }
}
