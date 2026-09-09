import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';

/**
 * Client untuk MAPID Competition API (host: server.mapid.io/web/competition).
 *
 * API ini TERPISAH dari basemap.mapid.io maupun Map Editor GEO MAPID.
 * Inilah satu-satunya jalur resmi untuk menarik tiga dataset di PRD Bab 5:
 *   - activities  -> Community Maps, data survei aksesibilitas tim
 *   - menugo      -> Menu Go, kepadatan kuliner & UMKM
 *   - propertigo  -> Properti Go, kepadatan properti komersial
 *
 * Autentikasi memakai header x-api-key dengan kunci yang sama seperti basemap
 * (dibuat di Dashboard MAPID -> Map Services -> API Keys).
 */

// ==========================================================================
// GEOMETRI PENCARIAN
// ==========================================================================

/** Cincin polygon: [lng, lat][] - minimal 4 titik dan harus tertutup. */
export type PolygonRing = Array<[number, number]>;

export interface SearchPolygon {
  type: 'Polygon';
  coordinates: PolygonRing[];
}

/**
 * Kedua API menolak MultiPolygon, Point, dan LineString - hanya Polygon tunggal.
 * Karena 7 zona survei tersebar dan tidak menyatu, area pencarian dikirim
 * satu per satu, bukan digabung sebagai MultiPolygon.
 */
export function assertValidSearchPolygon(polygon: SearchPolygon): void {
  if (polygon?.type !== 'Polygon') {
    throw new Error('feature harus bertipe Polygon (bukan MultiPolygon/Point/LineString)');
  }
  if (!Array.isArray(polygon.coordinates) || polygon.coordinates.length === 0) {
    throw new Error('Polygon harus memiliki minimal satu cincin koordinat');
  }

  for (const ring of polygon.coordinates) {
    if (ring.length < 4) {
      throw new Error('Setiap cincin polygon harus memiliki minimal 4 titik');
    }
    const [firstLng, firstLat] = ring[0];
    const [lastLng, lastLat] = ring[ring.length - 1];
    if (firstLng !== lastLng || firstLat !== lastLat) {
      throw new Error('Cincin polygon harus tertutup: titik pertama dan terakhir wajib sama');
    }
  }
}

/** Membentuk polygon persegi tertutup dari bounding box. */
export function bboxToPolygon(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): SearchPolygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}

/**
 * Area studi DifaMap sebagai satu bounding box yang melingkupi Makassar & Gowa.
 *
 * CATATAN: ini kotak pembatas kasar, BUKAN batas administratif 7 kecamatan.
 * Hasil tarikan masih perlu disaring dan ditandai per kecamatan saat cleaning.
 * Ganti dengan poligon batas kecamatan asli begitu GeoJSON-nya tersedia.
 */
export const STUDY_AREA_BBOX: [number, number, number, number] = [119.38, -5.26, 119.56, -5.10];

export const STUDY_AREA_POLYGON = bboxToPolygon(
  STUDY_AREA_BBOX[0],
  STUDY_AREA_BBOX[1],
  STUDY_AREA_BBOX[2],
  STUDY_AREA_BBOX[3]
);

// ==========================================================================
// PARAMETER KAMPANYE SURVEI DIFAMAP
// ==========================================================================

/**
 * Tagar tim, dipakai memfilter Activities milik survei DifaMap.
 * Dikirim tanpa tanda pagar: server mencocokkannya sebagai substring.
 *
 * PERINGATAN: MAPID mencocokkan hashtag ke kolom `description`, BUKAN `title`.
 * Kalau surveyor hanya menaruh tagar di judul, filter ini mengembalikan kosong.
 * Uji tanpa filter tagar dulu sebelum mempercayainya.
 */
export const SURVEY_HASHTAG = 'cerobongasap';

/**
 * Akun MAPID anggota Tim Cerobong Asap.
 *
 * PENTING - ini PENANDA, bukan penyaring. Seluruh Activity di area studi
 * diperlakukan sama, termasuk kiriman peserta lain, karena Survey Activities
 * adalah data milik bersama dan aturan lomba mengizinkannya (keputusan tim,
 * 9 Sep 2026). Sebelumnya daftar ini dipakai membuang 5 titik dari peserta
 * lain; itu sudah tidak berlaku, dan menyamakan hasilnya dengan importer yang
 * dipakai anggota tim lain.
 *
 * Daftarnya tetap disimpan karena asal titik masih informasi berguna - untuk
 * presentasi ke juri, dan untuk menelusuri kualitas data bila ada kejanggalan.
 * Yang berubah hanya perlakuannya: ditandai, tidak dibuang.
 *
 * Tagar #cerobongasap sengaja tidak dipakai sebagai penanda. Terbukti tidak
 * andal pada data sungguhan: 4 titik atyas dan 1 titik amarr tidak bertagar
 * semata karena surveyornya lupa mengetiknya.
 */
export const SURVEY_TEAM_USERNAMES = ['randymuflih', 'atyas', 'amarr', 'aixii16'] as const;

/** Benar bila activity ditulis anggota Tim Cerobong Asap. Untuk penandaan saja. */
export function isTeamSurveyActivity(activity: CompetitionActivity): boolean {
  const author = activity.user_name?.trim().toLowerCase();
  if (!author) return false;
  return (SURVEY_TEAM_USERNAMES as readonly string[]).includes(author);
}

/**
 * Rentang tarikan data survei lapangan (13-30 Agustus 2026).
 *
 * `endDate` sengaja dilebihkan sampai akhir September: MAPID memfilter
 * berdasarkan `created_at` (kapan postingan dibuat), bukan kapan lokasinya
 * dikunjungi. Titik yang disurvei 30 Agustus tapi baru diunggah awal September
 * akan hilang kalau batasnya dipatok tepat di 2026-08-30.
 */
export const SURVEY_PERIOD = {
  startDate: '2026-08-13',
  endDate: '2026-09-30',
};

// ==========================================================================
// TIPE RESPONS
// ==========================================================================

export interface CompetitionActivity {
  _id: string;
  title: string;
  description: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  medias: string[];

  // Ketiganya OPSIONAL, berbeda dari dokumentasi yang menyatakannya selalu ada.
  // Terbukti dari 89 record survei sungguhan (uji 2 Sep 2026):
  //   user_name            hadir di 87/89
  //   user_full_name       hadir di 59/89
  //   user_profile_picture tidak pernah dikirim sama sekali
  // Sebelumnya dua yang pertama dideklarasikan wajib, sehingga kode seperti
  // `a.user_full_name.trim()` lolos typecheck tapi meledak saat berjalan pada
  // sepertiga data. Selalu sediakan fallback saat menampilkannya.
  user_name?: string;
  user_full_name?: string;
  user_profile_picture?: string;

  community_name?: string;
  community_picture?: string;
  community_description?: string;
  created_at: string;
  likes?: Array<Record<string, any>>;
  total_comment?: number;
}

export interface MissionFeature<P = Record<string, any>> {
  _id: string;
  mission: string;
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  key: string;
  properties: P;
}

/**
 * Properti Menu Go. Perhatikan `kondisi_tempat` dan `mobilitas`: dua kolom ini
 * bukan sekadar data ekonomi, tapi keterangan yang relevan untuk aksesibilitas.
 */
export interface MenuGoProperties {
  nama_tempat?: string;
  jenis_tempat?: string;
  tanggal?: string;
  waktu?: string;
  jam_buka?: string;
  jam_tutup?: string;
  foto_tempat?: string;
  foto_menu_1?: string;
  foto_menu_2?: string;
  link_menu?: string;
  menu_utama?: string;
  harga_rata_rata?: number;
  kondisi_tempat?: string;
  mobilitas?: string;
  catatan?: string;
}

export interface PropertiGoProperties {
  kategori_properti?: string;
  jenis_properti?: string;
  tanggal?: string;
  alamat?: string;
  foto_tampak_depan?: string;
  foto_spanduk?: string;
  catatan?: string;
}

export type MissionType = 'menugo' | 'propertigo' | 'struckgo';

export interface FetchActivitiesInput {
  polygon: SearchPolygon;
  /** startDate & endDate wajib dikirim berpasangan (format YYYY-MM-DD). */
  startDate?: string;
  endDate?: string;
  hashtag?: string[];
  author?: string;
}

// ==========================================================================
// SERVICE
// ==========================================================================

/** Batas per halaman endpoint mission - dipatok server, tidak bisa diubah. */
const MISSION_PAGE_LIMIT = 100;

/** Batas endpoint activities bila TIDAK mengirim rentang tanggal. */
const ACTIVITIES_LIMIT_WITHOUT_DATE_RANGE = 60;

class MapIdCompetitionService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.MAPID_COMPETITION_URL,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.MAPID_API_KEY,
      },
    });
  }

  /**
   * Menarik Community Maps (Activities) di dalam sebuah polygon.
   *
   * PENTING: tanpa rentang tanggal, server hanya mengembalikan 60 record dan
   * TIDAK memberi tanda bahwa hasilnya terpotong. Untuk menarik seluruh hasil
   * survei, startDate + endDate wajib dikirim.
   */
  async fetchActivities(input: FetchActivitiesInput): Promise<{
    activities: CompetitionActivity[];
    total: number;
    truncated: boolean;
  }> {
    const { polygon, startDate, endDate, hashtag, author } = input;
    assertValidSearchPolygon(polygon);

    if (Boolean(startDate) !== Boolean(endDate)) {
      throw new Error('startDate dan endDate harus dikirim berpasangan');
    }

    const body: Record<string, any> = { feature: polygon };
    if (startDate && endDate) {
      body.start_date = startDate;
      body.end_date = endDate;
    }
    if (hashtag?.length) body.hashtag = hashtag;
    if (author) body.author = author;

    try {
      const { data } = await this.client.post('/activities', body);
      const activities: CompetitionActivity[] = data?.data?.activities ?? [];
      const total: number = data?.meta?.total ?? activities.length;

      return {
        activities,
        total,
        // Tanpa rentang tanggal, hasil yang mentok di 60 hampir pasti terpotong.
        truncated: !startDate && activities.length >= ACTIVITIES_LIMIT_WITHOUT_DATE_RANGE,
      };
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || `Gagal mengambil Activities dari MAPID: ${error.message}`
      );
    }
  }

  /**
   * Menarik satu halaman data mission (Menu Go / Properti Go / Struck Go).
   * Server memaksa limit 100; paginasi hanya lewat `offset`.
   */
  async fetchMissionPage<P = Record<string, any>>(
    missionType: MissionType,
    polygon: SearchPolygon,
    offset = 0
  ): Promise<{
    features: Array<MissionFeature<P>>;
    total: number;
    hasMore: boolean;
  }> {
    assertValidSearchPolygon(polygon);

    try {
      const { data } = await this.client.post(`/${missionType}`, { feature: polygon, offset });
      return {
        features: data?.features ?? [],
        total: data?.pagination?.total ?? 0,
        hasMore: Boolean(data?.pagination?.hasMore),
      };
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message ||
          `Gagal mengambil mission '${missionType}' dari MAPID: ${error.message}`
      );
    }
  }

  /**
   * Menarik SELURUH data mission dalam polygon dengan menelusuri offset.
   *
   * Server membalas 400 jika offset melampaui total, jadi perulangan berhenti
   * berdasarkan hasMore dan jumlah yang sudah terkumpul - bukan dengan mencoba
   * lalu menangkap error.
   */
  async fetchAllMissions<P = Record<string, any>>(
    missionType: MissionType,
    polygon: SearchPolygon,
    maxPages = 50
  ): Promise<{ features: Array<MissionFeature<P>>; total: number; complete: boolean }> {
    const collected: Array<MissionFeature<P>> = [];
    let offset = 0;
    let total = 0;
    let complete = true;

    for (let page = 0; ; page++) {
      if (page >= maxPages) {
        // Batas pengaman: jangan menelusuri tanpa henti kalau server terus
        // melaporkan hasMore. Tandai supaya pemanggil tahu data belum lengkap.
        complete = false;
        break;
      }

      const result = await this.fetchMissionPage<P>(missionType, polygon, offset);
      total = result.total;
      collected.push(...result.features);

      if (!result.hasMore || result.features.length === 0) break;

      offset += result.features.length;
      if (offset >= total) break;
    }

    return { features: collected, total, complete };
  }

  /**
   * Menarik data survei resmi DifaMap: rentang tanggal kampanye + area studi,
   * lalu disaring ke anggota tim saja.
   *
   * Penyaringan dilakukan di sisi kita, bukan lewat parameter `author` MAPID,
   * karena parameter itu hanya menerima SATU nama dan mencocokkannya secara
   * parsial (substring) ke name atau full_name — terlalu longgar dan butuh
   * empat permintaan terpisah. Menarik sekali lalu menyaring lebih tepat dan
   * lebih murah; jumlah datanya kecil.
   */
  async fetchSurveyActivities(options: { polygon?: SearchPolygon } = {}) {
    const { polygon = STUDY_AREA_POLYGON } = options;

    const hasil = await this.fetchActivities({
      polygon,
      startDate: SURVEY_PERIOD.startDate,
      endDate: SURVEY_PERIOD.endDate,
    });

    const dariTim = hasil.activities.filter(isTeamSurveyActivity).length;

    return {
      ...hasil,
      // Asal titik dilaporkan, bukan dipakai membuang. Informasinya tetap ada
      // untuk presentasi dan penelusuran kualitas data.
      rincianPenulis: {
        total: hasil.activities.length,
        timSendiri: dariTim,
        pesertaLain: hasil.activities.length - dariTim,
      },
    };
  }

  /** Menu Go - kuliner & UMKM, membawa juga `kondisi_tempat` dan `mobilitas`. */
  fetchMenuGo(polygon: SearchPolygon) {
    return this.fetchAllMissions<MenuGoProperties>('menugo', polygon);
  }

  /** Properti Go - kepadatan bangunan & properti komersial. */
  fetchPropertiGo(polygon: SearchPolygon) {
    return this.fetchAllMissions<PropertiGoProperties>('propertigo', polygon);
  }
}

export const mapIdCompetitionService = new MapIdCompetitionService();

export { MISSION_PAGE_LIMIT, ACTIVITIES_LIMIT_WITHOUT_DATE_RANGE };
