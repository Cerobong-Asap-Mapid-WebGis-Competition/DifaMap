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

/**
 * Nama lokal yang tidak dikenal OpenStreetMap.
 *
 * OSM menyimpan sebagian tempat dengan nama historis atau asingnya saja.
 * "Benteng Rotterdam" - nama yang dipakai sehari-hari di Makassar - menghasilkan
 * NOL hasil di Photon maupun Nominatim, karena OSM hanya mengenal "Fort
 * Rotterdam". Tidak ada cara memperbaikinya dari sisi kita selain menerjemahkan
 * sebelum bertanya.
 *
 * Daftar ini sengaja pendek dan dirawat tangan. Menambahnya cukup satu baris,
 * dan sebaiknya dilakukan setiap kali ada pencarian yang gagal padahal
 * tempatnya jelas ada.
 */
const NAMA_LOKAL: Array<[RegExp, string]> = [
  [/benteng\s+rotterdam/i, 'Fort Rotterdam'],
  [/benteng\s+ujung\s+pandang/i, 'Fort Rotterdam'],
  [/bandara\s+(sultan\s+)?hasanuddin/i, 'Sultan Hasanuddin International Airport'],
  [/pantai\s+losari/i, 'Anjungan Pantai Losari'],
  [/mal\s+ratu\s+indah/i, 'Mall Ratu Indah'],
  [/\bmari\b/i, 'Mall Ratu Indah'],
  [/\bmtos\b/i, 'Mall Panakkukang'],
  [/\bunhas\b/i, 'Universitas Hasanuddin'],
  [/\bunm\b/i, 'Universitas Negeri Makassar'],
];

function terjemahkanNamaLokal(kueri: string): string {
  for (const [pola, ganti] of NAMA_LOKAL) {
    if (pola.test(kueri)) return kueri.replace(pola, ganti);
  }
  return kueri;
}

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

  const kueriCari = terjemahkanNamaLokal(kueri.trim());

  async function tanya(pakaiKotak: boolean): Promise<any[]> {
    const alamat = new URL(PHOTON);
    alamat.searchParams.set('q', kueriCari);
    alamat.searchParams.set('limit', String(Math.min(15, batas * 3)));

    if (pakaiKotak) {
      // Kotak pembatas membuang hasil luar wilayah. Tanpa ini "hotel cla" pernah
      // mengembalikan penginapan di Argentina dan Spanyol lebih dulu.
      alamat.searchParams.set(
        'bbox',
        `${KOTAK_WILAYAH.minLng},${KOTAK_WILAYAH.minLat},${KOTAK_WILAYAH.maxLng},${KOTAK_WILAYAH.maxLat}`
      );
    } else {
      // Percobaan kedua: tanpa kotak, hanya dibias ke pusat Makassar, lalu
      // disaring sendiri. Kotak pembatas kadang membuang tempat yang titiknya
      // terdaftar sedikit di luar batas - bandara dan kawasan pinggiran
      // termasuk di antaranya.
      alamat.searchParams.set('lat', '-5.15');
      alamat.searchParams.set('lon', '119.43');
    }

    const res = await fetch(alamat.toString(), { headers: { 'User-Agent': IDENTITAS } });
    if (!res.ok) throw new Error(`Photon menjawab ${res.status}`);
    const isi = (await res.json()) as any;
    return isi?.features ?? [];
  }

  let fitur = await tanya(true);

  if (fitur.length === 0) {
    await tungguGiliran();
    const cadangan = await tanya(false);
    fitur = cadangan.filter((f: any) => {
      const c = f?.geometry?.coordinates;
      if (!Array.isArray(c)) return false;
      const [lng, lat] = c;
      // Sedikit lebih longgar dari kotak wilayah studi, supaya tempat di tepi
      // - bandara, kawasan Gowa selatan - tetap terjaring.
      return lng > 119.3 && lng < 119.65 && lat > -5.35 && lat < -5.0;
    });
  }

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
    })
    .slice(0, batas);

  simpanan.set(q, { waktu: Date.now(), hasil });
  return hasil;
}

/**
 * Nama daerah untuk sebuah koordinat.
 *
 * Sel grid sebelumnya hanya bernomor - "MKSR-SINI-137" - dan nomor itu tidak
 * memberi tahu siapa pun di mana letaknya. Yang dicari di sini bukan alamat
 * lengkap melainkan nama daerahnya: kelurahan bila ada, jalan bila tidak, dan
 * kota sebagai jaring terakhir.
 *
 * Hasilnya disimpan tanpa kedaluwarsa. Nama kelurahan tidak berubah dari menit
 * ke menit, sementara tiap panggilan berbiaya seperempat detik antrean - dan
 * grid yang sama diminta berulang kali setiap pengguna mengganti parameternya.
 */
const simpananBalik = new Map<string, string | null>();

export async function namaiKoordinat(
  latitude: number,
  longitude: number
): Promise<string | null> {
  const kunci = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  if (simpananBalik.has(kunci)) return simpananBalik.get(kunci) ?? null;

  try {
    await tungguGiliran();

    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&limit=1`,
      { headers: { 'User-Agent': 'DifaMap/1.0 (WebGIS aksesibilitas Makassar)' } }
    );

    // Kegagalan TIDAK disimpan. Simpanan ini tanpa kedaluwarsa, jadi satu
    // gangguan jaringan sesaat akan mengunci koordinat itu sebagai "tanpa nama"
    // selama proses hidup - dan nama daerahnya tidak akan pernah muncul lagi
    // walau layanannya sudah pulih semenit kemudian.
    if (!res.ok) return null;

    const data: any = await res.json();
    const p = data?.features?.[0]?.properties ?? {};

    // Urutan dari yang paling menunjuk tempat ke yang paling umum.
    const nama: string | null =
      p.district || p.locality || p.suburb || p.street || p.city || p.county || null;

    simpananBalik.set(kunci, nama);
    return nama;
  } catch {
    return null;
  }
}
