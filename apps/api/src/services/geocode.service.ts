/**
 * Pencarian tempat di luar basis data DifaMap.
 *
 * DifaMap hanya menyimpan PENGAMATAN survei - 94 titik - dan lima belas tempat
 * yang ditulis tim. Orang yang membuka peta mencari tempat yang mereka tuju,
 * dan sebagian besar di antaranya belum pernah kita survei sama sekali.
 *
 * MAPID tidak menyediakan layanan pencarian tempat: yang ada hanya basemap,
 * daftar layer geoserver, dan Competition API. Jadi nama dan koordinat tempat
 * diambil dari Nominatim, layanan pencarian resmi OpenStreetMap - sumber yang
 * sama dengan yang dipakai basemap MAPID sendiri untuk nama jalannya.
 *
 * Hasilnya hanya dipakai sebagai TITIK PUSAT. Penilaian aksesibilitas tetap
 * sepenuhnya dari survei DifaMap di sekitarnya; bila tidak ada, panel menyatakan
 * datanya belum ada.
 *
 *
 * KEWAJIBAN PEMAKAIAN
 *
 * Nominatim gratis dengan syarat: satu permintaan per detik, wajib menyebut
 * identitas pemakai, dan tidak boleh dibanjiri. Ketiganya dipatuhi di sini -
 * antrean berjarak, User-Agent yang menyebut DifaMap, dan hasil disimpan
 * sementara supaya kata kunci yang sama tidak ditanyakan berulang.
 *
 * Kalau suatu saat MAPID menyediakan layanan serupa, hanya berkas ini yang
 * perlu diganti.
 */

/** Kotak pembatas 7 kecamatan wilayah studi: Makassar & Gowa. */
const KOTAK_WILAYAH = { minLng: 119.35, minLat: -5.27, maxLng: 119.58, maxLat: -5.09 };

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const IDENTITAS = 'DifaMap/0.1 (WebGIS aksesibilitas - kompetisi MAPID 2026)';

/** Jeda antar permintaan, mengikuti syarat pemakaian Nominatim. */
const JEDA_MS = 1100;

/** Umur simpanan sementara. Nama tempat hampir tidak pernah berubah. */
const UMUR_SIMPANAN_MS = 30 * 60 * 1000;

export interface TempatDitemukan {
  nama: string;
  alamat: string;
  kategori: string;
  latitude: number;
  longitude: number;
}

const simpanan = new Map<string, { waktu: number; hasil: TempatDitemukan[] }>();
let permintaanTerakhir = 0;

/**
 * Menerjemahkan kelas OSM ke kategori yang dikenal peta DifaMap, supaya
 * lambangnya cocok dengan tempat pilihan tim.
 */
function petakanKategori(kelas?: string, jenis?: string): string {
  const k = `${kelas ?? ''}:${jenis ?? ''}`.toLowerCase();
  if (/mall|supermarket|department_store|marketplace/.test(k)) return 'MALL';
  if (/hospital|clinic|doctors|pharmacy|healthcare/.test(k)) return 'HEALTHCARE';
  if (/school|university|college|kindergarten/.test(k)) return 'EDUCATION';
  if (/hotel|motel|guest_house|hostel/.test(k)) return 'HOTEL';
  if (/office|government|townhall/.test(k)) return 'OFFICE';
  if (/bus_stop|bus_station|station|terminal/.test(k)) return 'BUS_STOP';
  if (/tourism|attraction|park|museum|place_of_worship|mosque/.test(k)) return 'TOURISM';
  return 'OTHER';
}

/** Nama pendek: Nominatim mengembalikan alamat lengkap yang terlalu panjang. */
function namaPendek(item: any): string {
  return item.name || String(item.display_name || '').split(',')[0].trim();
}

async function tungguGiliran(): Promise<void> {
  const sejak = Date.now() - permintaanTerakhir;
  if (sejak < JEDA_MS) {
    await new Promise((r) => setTimeout(r, JEDA_MS - sejak));
  }
  permintaanTerakhir = Date.now();
}

export async function cariTempat(kueri: string, batas = 5): Promise<TempatDitemukan[]> {
  const q = kueri.trim().toLowerCase();
  if (q.length < 3) return [];

  const tersimpan = simpanan.get(q);
  if (tersimpan && Date.now() - tersimpan.waktu < UMUR_SIMPANAN_MS) {
    return tersimpan.hasil;
  }

  await tungguGiliran();

  const alamat = new URL(NOMINATIM);
  alamat.searchParams.set('q', kueri.trim());
  alamat.searchParams.set('format', 'json');
  alamat.searchParams.set('limit', String(Math.min(10, batas)));
  alamat.searchParams.set('addressdetails', '1');
  // bounded=1 membuang hasil di luar wilayah studi. Tanpa ini, "Mall Panakkukang"
  // bisa kalah oleh tempat bernama mirip di kota lain.
  alamat.searchParams.set(
    'viewbox',
    `${KOTAK_WILAYAH.minLng},${KOTAK_WILAYAH.minLat},${KOTAK_WILAYAH.maxLng},${KOTAK_WILAYAH.maxLat}`
  );
  alamat.searchParams.set('bounded', '1');

  const res = await fetch(alamat.toString(), {
    headers: { 'User-Agent': IDENTITAS, 'Accept-Language': 'id' },
  });

  if (!res.ok) {
    throw new Error(`Nominatim menjawab ${res.status}`);
  }

  // fetch bawaan Node mengembalikan unknown; bentuknya dijamin oleh Nominatim.
  const mentah = (await res.json()) as any[];
  const hasil: TempatDitemukan[] = mentah.map((x) => ({
    nama: namaPendek(x),
    alamat: String(x.display_name || ''),
    kategori: petakanKategori(x.class, x.type),
    latitude: Number(x.lat),
    longitude: Number(x.lon),
  }));

  simpanan.set(q, { waktu: Date.now(), hasil });
  return hasil;
}
