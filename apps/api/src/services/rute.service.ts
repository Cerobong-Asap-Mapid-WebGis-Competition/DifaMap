/**
 * Rute dan isokron profil KURSI RODA, lewat OpenRouteService.
 *
 *
 * KENAPA LAYANAN INI
 *
 * Dua hal di DifaMap sebelumnya hanya pura-pura:
 *
 *   - "Isokron" di panel Site Analysis sebenarnya lingkaran. Radiusnya dihitung
 *     menit dikali 60 meter, tanpa peduli ada jalan atau tidak - bahkan
 *     menyeberangi sungai dan laut. Panelnya sendiri mengakui itu dengan
 *     keterangan "lingkaran radius, bukan isokron jaringan jalan".
 *
 *   - Rute perjalanan di Difa AI adalah garis lurus antara dua titik.
 *
 * OSRM sempat diuji sebagai pengganti dan ditolak: server publiknya hanya
 * menjalankan profil mobil. Ketiga profil - foot, walking, driving - menjawab
 * identik, 38 km/jam. Rute mobil untuk kursi roda bukan sekadar tidak akurat,
 * melainkan menyesatkan; mobil melewati jalan tanpa trotoar dan jalan layang.
 *
 * OpenRouteService punya profil `wheelchair` sungguhan. Diuji pada jalur yang
 * sama: kursi roda 16 menit, jalan kaki 13 menit untuk jarak yang sama - dua
 * profil yang benar-benar berbeda, bukan satu profil dengan tiga nama.
 *
 *
 * BATAS PEMAKAIAN
 *
 * Jatah gratis: 2.000 rute dan 500 isokron per hari, 40 dan 20 per menit.
 * Cukup longgar untuk pemakaian normal, tetapi tetap bisa habis - karena itu
 * setiap kegagalan ditangani dengan mengembalikan null, dan pemanggilnya wajib
 * menyiapkan cadangan. Fitur yang mati total ketika jatah habis lebih buruk
 * daripada fitur yang turun kualitasnya dengan jujur.
 */

import { env } from '../config/env.js';

const PROFIL_KURSI_RODA = 'wheelchair';
const PROFIL_JALAN_KAKI = 'foot-walking';

export type ModaJalan = 'wheelchair' | 'walking';

const profilDari = (moda: ModaJalan) =>
  moda === 'walking' ? PROFIL_JALAN_KAKI : PROFIL_KURSI_RODA;

function tersedia(): boolean {
  return Boolean(env.ORS_API_KEY && env.ORS_API_KEY.length > 20);
}

async function panggil(jalur: string, badan: unknown): Promise<any | null> {
  if (!tersedia()) return null;

  try {
    const res = await fetch(`${env.ORS_BASE_URL}${jalur}`, {
      method: 'POST',
      headers: {
        Authorization: env.ORS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(badan),
    });

    if (!res.ok) {
      // 403 biasanya berarti jatah harian habis; 404 berarti alamat berubah.
      console.warn(`[rute] OpenRouteService menjawab ${res.status} untuk ${jalur}`);
      return null;
    }

    return await res.json();
  } catch (err: any) {
    console.warn('[rute] OpenRouteService tidak terhubung:', err.message);
    return null;
  }
}

export interface RingkasanRute {
  jarakMeter: number;
  durasiDetik: number;
  moda: ModaJalan;
  /** Titik-titik jalur, [lng, lat]. Dipakai untuk menggambar dan mencari sekitar. */
  jalur: Array<[number, number]>;
}

/**
 * Beberapa jalur sekaligus dari satu titik ke titik lain.
 *
 * Jalur terpendek belum tentu yang paling bisa dilalui kursi roda - dan itulah
 * inti persoalannya. Aplikasi peta umum merekomendasikan yang tercepat karena
 * tidak punya data kondisi trotoar per ruas; DifaMap punya, jadi bisa memilih
 * berdasarkan apa yang benar-benar ada di jalan.
 *
 * share_factor 0.6 membatasi berapa banyak ruas yang boleh dipakai bersama
 * antar jalur, supaya alternatifnya benar-benar berbeda dan bukan variasi
 * sepele dari jalur yang sama.
 */
export async function hitungBeberapaRute(
  dari: { latitude: number; longitude: number },
  ke: { latitude: number; longitude: number },
  moda: ModaJalan = 'wheelchair',
  jumlah = 3
): Promise<RingkasanRute[]> {
  const hasil = await panggil(`/v2/directions/${profilDari(moda)}/geojson`, {
    coordinates: [
      [dari.longitude, dari.latitude],
      [ke.longitude, ke.latitude],
    ],
    alternative_routes: { target_count: jumlah, share_factor: 0.6, weight_factor: 1.6 },
  });

  const fitur: any[] = hasil?.features ?? [];

  return fitur
    .filter((f) => f?.properties?.summary && Array.isArray(f?.geometry?.coordinates))
    .map((f) => ({
      jarakMeter: Math.round(f.properties.summary.distance),
      durasiDetik: Math.round(f.properties.summary.duration),
      moda,
      jalur: f.geometry.coordinates as Array<[number, number]>,
    }));
}

/**
 * Rute dari satu titik ke titik lain, mengikuti jalan yang benar-benar ada.
 * Mengembalikan null bila layanan tidak tersedia - pemanggil memakai garis lurus.
 */
export async function hitungRute(
  dari: { latitude: number; longitude: number },
  ke: { latitude: number; longitude: number },
  moda: ModaJalan = 'wheelchair'
): Promise<RingkasanRute | null> {
  const hasil = await panggil(`/v2/directions/${profilDari(moda)}/geojson`, {
    coordinates: [
      [dari.longitude, dari.latitude],
      [ke.longitude, ke.latitude],
    ],
  });

  const fitur = hasil?.features?.[0];
  if (!fitur?.properties?.summary) return null;

  return {
    jarakMeter: Math.round(fitur.properties.summary.distance),
    durasiDetik: Math.round(fitur.properties.summary.duration),
    moda,
    jalur: fitur.geometry?.coordinates ?? [],
  };
}

/**
 * Poligon jangkauan waktu tempuh - isokron yang sesungguhnya, mengikuti jalan.
 * Mengembalikan null bila layanan tidak tersedia.
 */
export async function hitungIsokron(
  pusat: { latitude: number; longitude: number },
  menit: number[],
  moda: ModaJalan = 'wheelchair'
): Promise<any | null> {
  const hasil = await panggil(`/v2/isochrones/${profilDari(moda)}`, {
    locations: [[pusat.longitude, pusat.latitude]],
    range: menit.map((m) => m * 60),
    range_type: 'time',
  });

  if (!hasil?.features?.length) return null;
  return hasil;
}
