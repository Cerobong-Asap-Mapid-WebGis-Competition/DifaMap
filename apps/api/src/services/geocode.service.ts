/**
 * Pencarian tempat di luar basis data DifaMap.
 *
 * DifaMap hanya menyimpan PENGAMATAN survei - 94 titik - dan lima belas tempat
 * yang ditulis tim. Orang yang membuka peta mencari tempat yang mereka tuju,
 * dan sebagian besar di antaranya belum pernah kita survei sama sekali.
 *
 * MAPID tidak menyediakan layanan pencarian tempat: yang ada hanya basemap,
 * daftar layer geoserver, dan Competition API. Jadi nama dan koordinat tempat
 * diambil dari Photon, layanan pencarian berbasis data OpenStreetMap - sumber
 * yang sama dengan yang dipakai basemap MAPID sendiri untuk nama jalannya.
 *
 * Hasilnya hanya dipakai sebagai TITIK PUSAT. Penilaian aksesibilitas tetap
 * sepenuhnya dari survei DifaMap di sekitarnya; bila tidak ada, panel menyatakan
 * datanya belum ada.
 *
 *
 * KEWAJIBAN PEMAKAIAN
 *
 * Layanannya gratis dan tanpa kunci, dengan harapan dipakai sewajarnya. Karena
 * itu permintaan diberi jarak, menyebut identitas DifaMap, dan hasilnya disimpan
 * sementara supaya kata kunci yang sama tidak ditanyakan berulang.
 *
 * Kalau suatu saat MAPID menyediakan layanan serupa, hanya berkas ini yang
 * perlu diganti.
 */

/** Kotak pembatas 7 kecamatan wilayah studi: Makassar & Gowa. */
const KOTAK_WILAYAH = { minLng: 119.35, minLat: -5.27, maxLng: 119.58, maxLat: -5.09 };

/**
 * Photon, bukan Nominatim.
 *
 * Keduanya membaca data OpenStreetMap yang sama, tetapi Nominatim mencocokkan
 * kata utuh: mengetik "mall pa" mengembalikan nol hasil, dan baru muncul setelah
 * "mall panakkukang" lengkap. Untuk kotak pencarian yang menyarankan sambil
 * diketik, itu berarti tidak ada saran sampai kata terakhir selesai.
 *
 * Photon memang dibuat untuk keperluan ini. "mall pa" langsung mengembalikan
 * Mall Panakkukang beserta empat tempat di dalamnya.
 */
const PHOTON = 'https://photon.komoot.io/api/';
const IDENTITAS = 'DifaMap/0.1 (WebGIS aksesibilitas - kompetisi MAPID 2026)';

/**
 * Jeda antar permintaan. Photon dirancang untuk dipanggil sambil mengetik, jadi
 * tidak seketat Nominatim - tetapi tetap diberi jarak, dan ketikan di sisi
 * peramban sudah ditunda lebih dulu.
 */
const JEDA_MS = 250;

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
  if (/mall|supermarket|department_store|marketplace/.test(k)) return 'MALL';
  if (/hospital|clinic|doctors|pharmacy|healthcare/.test(k)) return 'HEALTHCARE';
  if (/school|university|college|kindergarten/.test(k)) return 'EDUCATION';
  if (/hotel|motel|guest_house|hostel/.test(k)) return 'HOTEL';
  if (/office|government|townhall/.test(k)) return 'OFFICE';
  if (/bus_stop|bus_station|station|terminal/.test(k)) return 'BUS_STOP';
  if (/tourism|attraction|park|museum|place_of_worship|mosque/.test(k)) return 'TOURISM';
  return 'OTHER';
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

  const alamat = new URL(PHOTON);
  alamat.searchParams.set('q', kueri.trim());
  alamat.searchParams.set('limit', String(Math.min(10, batas)));
  // Kotak pembatas membuang hasil luar wilayah. Tanpa ini "hotel cla" pernah
  // mengembalikan penginapan di Argentina dan Spanyol sebelum yang di Makassar.
  alamat.searchParams.set(
    'bbox',
    `${KOTAK_WILAYAH.minLng},${KOTAK_WILAYAH.minLat},${KOTAK_WILAYAH.maxLng},${KOTAK_WILAYAH.maxLat}`
  );

  const res = await fetch(alamat.toString(), {
    headers: { 'User-Agent': IDENTITAS },
  });

  if (!res.ok) {
    throw new Error(`Photon menjawab ${res.status}`);
  }

  // fetch bawaan Node mengembalikan unknown; bentuknya dijamin oleh Photon.
  const mentah = (await res.json()) as any;
  const fitur: any[] = mentah?.features ?? [];

  const hasil: TempatDitemukan[] = fitur
    .filter((f) => f?.properties?.name && Array.isArray(f?.geometry?.coordinates))
    .map((f) => {
      const p = f.properties;
      // Alamat disusun sendiri: Photon memecahnya per bagian, dan sebagian
      // tempat hanya punya kecamatan tanpa nama jalan.
      const bagian = [p.street, p.district, p.city || p.county, p.state].filter(Boolean);
      return {
        nama: String(p.name),
        alamat: bagian.join(', '),
        kategori: petakanKategori(p.osm_key, p.osm_value),
        latitude: Number(f.geometry.coordinates[1]),
        longitude: Number(f.geometry.coordinates[0]),
      };
    });

  simpanan.set(q, { waktu: Date.now(), hasil });
  return hasil;
}
