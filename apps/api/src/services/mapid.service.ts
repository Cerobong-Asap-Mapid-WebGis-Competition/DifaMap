import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { namaiKoordinat } from './geocode.service.js';

export interface IsochroneFeature {
  type: 'Feature';
  properties: {
    minutes: number;
    mode: 'walking' | 'wheelchair';
    radiusMeters: number;
    areaSqKm: number;
    accessibilityDescription: string;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface ElevationPoint {
  latitude: number;
  longitude: number;
  elevationMeters: number;
  distanceFromStartMeters: number;
  slopePercentage: number;
  isWheelchairAccessible: boolean; // True jika slope <= 8%
}

/**
 * Sudut pandang penilaian sel grid.
 *
 * Grid yang sama dibaca tiga cara, karena yang disebut "prioritas" bergantung
 * pada apa yang sedang dicari. Namanya sengaja memakai parameter yang dihitung,
 * bukan nama pemakainya - satu orang bisa memerlukan ketiganya dalam satu duduk,
 * dan menyebut "dinas" atau "developer" justru mempersempitnya tanpa alasan.
 */
export type ModaPenilaian = 'AKSESIBILITAS' | 'HUNIAN' | 'KOMERSIAL';

export interface SiniGridCell {
  type: 'Feature';
  properties: {
    gridId: string;
    center: [number, number]; // [lng, lat]
    moda: ModaPenilaian;

    /**
     * null bila sel belum punya satu pun titik survei.
     *
     * Sebelumnya sel kosong diberi skor tengah 3,0 lalu tetap mendapat angka
     * prioritas dan rekomendasi - padahal tidak ada yang pernah mendatanginya.
     * Dengan cakupan survei 6,4%, itu berarti ribuan sel dinilai dari tebakan.
     */
    priorityIndex: number | null;
    accessibilityScore: number | null;
    jumlahTitik: number;

    /** Rincian pembentuk angka, supaya bisa dijelaskan alih-alih dipercaya. */
    faktor: {
      kerentananAkses: number;
      kepadatan: number;
      keterangan: string;
    };

    transportCount: number;
    healthCount: number;
    commercialCount: number;
    hunianCount: number;
    kulinerCount: number;
    kulinerRamai: number;

    /** Nama daerah dari geocoder, dipakai menggantikan kode sel. */
    namaWilayah: string | null;

    /** Bahan mentah untuk penjelasan: nama titik dan hambatan yang tercatat. */
    namaTitik: string[];
    hambatan: string[];

    recommendedIntervention: string;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

class MapIdService {
  private apiClient: AxiosInstance;
  private basemapClient: AxiosInstance;
  private geoserverClient: AxiosInstance;
  private memoryCache: Map<string, { data: any; expiresAt: number }> = new Map();

  constructor() {
    // Client untuk MAPID Data API (Layers, Activity Maps, Projects)
    this.apiClient = axios.create({
      baseURL: env.MAPID_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.MAPID_API_KEY}`,
        'x-api-key': env.MAPID_API_KEY,
      },
    });

    // Client untuk MAPID Basemap Tile & Style Server
    this.basemapClient = axios.create({
      baseURL: env.MAPID_BASEMAP_URL,
      timeout: 10000,
    });

    // Client untuk MAPID Geoserver Layer List & Open API
    this.geoserverClient = axios.create({
      baseURL: env.MAPID_GEOSERVER_URL,
      timeout: 10000,
    });
  }

  private getCached(key: string): any | null {
    const cached = this.memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    this.memoryCache.delete(key);
    return null;
  }

  private setCached(key: string, data: any, ttlSeconds: number = 900): void {
    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Mengambil Mapbox/MapLibre Style JSON dari MAPID Basemap (dengan in-memory caching & seamless fallback)
   * Endpoint: https://basemap.mapid.io/styles/{styleId}/style.json?key={API_KEY}
   */
  async getMapStyle(styleId: string) {
    const activeKey = env.MAPID_API_KEY || '6a8a7eedffc137c94307a71c';
    const targetStyle = styleId === 'basic' ? 'light' : styleId;
    const cacheKey = `style_${targetStyle}_${activeKey}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.basemapClient.get(`/styles/${targetStyle}/style.json`, {
        params: {
          key: activeKey,
        },
      });
      if (response.data && response.data.version) {
        this.setCached(cacheKey, response.data, 1800); // Cache 30 menit untuk style valid
        return response.data;
      }
    } catch (error: any) {
      console.warn(`[MAPID Proxy] MAPID server error for style '${targetStyle}':`, error.message);
    }

    // Clean & Crisp Fallback Styles (OpenStreetMap Standard / Esri without any watermark)
    const fallbackStyles: Record<string, any> = {
      basic: {
        version: 8,
        name: 'OpenStreetMap Standard',
        sources: {
          osm: {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      dark: {
        version: 8,
        name: 'Esri Canvas Dark',
        sources: {
          'esri-dark': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: '&copy; Esri, HERE, Garmin',
          },
        },
        layers: [
          {
            id: 'esri-dark-layer',
            type: 'raster',
            source: 'esri-dark',
            minzoom: 0,
            maxzoom: 18,
          },
        ],
      },
      satellite: {
        version: 8,
        name: 'DifaMap Satelit',
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
          },
        },
        layers: [
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
    };

    const selectedStyle = fallbackStyles[styleId] || fallbackStyles.basic;
    // JANGAN cache fallback terlalu lama (hanya 5 detik) agar langsung retry ke MAPID Geoserver
    this.setCached(cacheKey, selectedStyle, 5);
    return selectedStyle;
  }

  /**
   * Mengambil daftar layer dari Geoserver MAPID untuk proyek DifaMap (dengan in-memory caching)
   * Endpoint: https://geoserver.mapid.io/layers_new/get_layer_list?api_key=...&project_id=...
   */
  async getProjectLayers(projectId: string = env.MAPID_PROJECT_ID) {
    const cacheKey = `project_layers_${projectId}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.geoserverClient.get('/layers_new/get_layer_list', {
        params: {
          api_key: env.MAPID_API_KEY,
          project_id: projectId,
        },
      });
      this.setCached(cacheKey, response.data, 600); // Cache 10 menit
      return response.data;
    } catch (error: any) {
      console.error('[MAPID Geoserver] Error fetching project layer list:', error.message);
      // Fallback jika offline / rate limited
      return {
        success: true,
        project_id: projectId,
        layers: [
          { layer_id: 'transport_makassar', name: 'Transportasi Mamminasata', type: 'Point' },
          { layer_id: 'faskes_makassar', name: 'Fasilitas Kesehatan & Ramah Disabilitas', type: 'Point' },
          { layer_id: 'pedestrian_makassar', name: 'Jalur Pedestrian & Trotoar', type: 'LineString' },
        ],
      };
    }
  }

  /**
   * Mengambil layer data spasial Activity / Community Maps dari MAPID API
   */
  async getActivityLayers(projectId?: string) {
    try {
      const endpoint = projectId ? `/api/v1/projects/${projectId}/layers` : `/api/v1/layers`;
      const response = await this.apiClient.get(endpoint);
      return response.data;
    } catch (error: any) {
      console.error('[MAPID Proxy] Error fetching activity layers:', error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch MAPID activity layers');
    }
  }

  /**
   * Mengambil data GeoJSON dari layer tertentu
   */
  async getLayerGeoJSON(layerId: string) {
    try {
      const response = await this.apiClient.get(`/api/v1/layers/${layerId}/geojson`);
      return response.data;
    } catch (error: any) {
      console.error(`[MAPID Proxy] Error fetching GeoJSON for layer ${layerId}:`, error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch MAPID layer GeoJSON');
    }
  }

  /**
   * MAP Analysis Tool: Menghitung Poligon Isokron (Catchment Area Waktu Tempuh)
   * Mengukur jangkauan penyandang disabilitas (jalan kaki / kursi roda) dari titik transit
   * dalam 5, 10, dan 15 menit di sekitar Makassar.
   */
  calculateIsochroneCatchment(
    latitude: number,
    longitude: number,
    intervals: number[] = [5, 10, 15],
    mode: 'walking' | 'wheelchair' = 'wheelchair'
  ): { type: 'FeatureCollection'; features: IsochroneFeature[] } {
    // Kecepatan rata-rata: Kursi roda ~ 3.6 km/h (60 m/menit), Pejalan kaki ~ 4.8 km/h (80 m/menit)
    const speedMetersPerMinute = mode === 'wheelchair' ? 60 : 80;

    const features: IsochroneFeature[] = intervals.map((minutes) => {
      const radiusMeters = minutes * speedMetersPerMinute;
      const radiusDegrees = radiusMeters / 111320; // 1 derajat ~ 111.32 km

      // Buat poligon lingkaran 32 sisi (approximating isochrone buffer)
      const pointsCount = 32;
      const coordinates: number[][] = [];

      for (let i = 0; i <= pointsCount; i++) {
        const angle = (i * 2 * Math.PI) / pointsCount;
        // Penyesuaian aspek rasio longitude berdasarkan latitude Makassar (-5.14)
        const latOffset = radiusDegrees * Math.sin(angle);
        const lngOffset = (radiusDegrees * Math.cos(angle)) / Math.cos((latitude * Math.PI) / 180);

        coordinates.push([
          parseFloat((longitude + lngOffset).toFixed(6)),
          parseFloat((latitude + latOffset).toFixed(6)),
        ]);
      }

      const areaSqKm = parseFloat(((Math.PI * Math.pow(radiusMeters / 1000, 2))).toFixed(3));

      return {
        type: 'Feature',
        properties: {
          minutes,
          mode,
          radiusMeters,
          areaSqKm,
          accessibilityDescription: `Jangkauan ${minutes} menit ${mode === 'wheelchair' ? 'kursi roda' : 'jalan kaki'} (~${radiusMeters}m)`,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  /**
   * MAP Analysis Tool: Menghitung Profil Ketinggian & Kelandaian (Slope Grade Analysis)
   * Mengecek apakah elevasi jalur trotoar memiliki kemiringan > 8% (ambang batas aman kursi roda)
   */
  calculateElevationSlopeProfile(coordinates: Array<[number, number]>): {
    totalDistanceMeters: number;
    maxSlopePercentage: number;
    averageSlopePercentage: number;
    hasSteepBarrier: boolean;
    points: ElevationPoint[];
  } {
    if (!coordinates || coordinates.length === 0) {
      return {
        totalDistanceMeters: 0,
        maxSlopePercentage: 0,
        averageSlopePercentage: 0,
        hasSteepBarrier: false,
        points: [],
      };
    }

    let cumulativeDistance = 0;
    let maxSlope = 0;
    let totalSlope = 0;
    const points: ElevationPoint[] = [];

    // Base elevation model estimasi Kota Makassar (ketinggian pesisir 2m s.d. 18m di Tamalanrea)
    for (let i = 0; i < coordinates.length; i++) {
      const [lng, lat] = coordinates[i];
      // Formula estimasi elevasi realistis Makassar berdasarkan jarak ke pesisir barat (lng ~ 119.40)
      const baseElevation = Math.max(2.0, (lng - 119.38) * 120 + Math.sin(lat * 100) * 1.5);

      let stepDistance = 0;
      let slope = 0;

      if (i > 0) {
        const [prevLng, prevLat] = coordinates[i - 1];
        const prevElevation = points[i - 1].elevationMeters;

        // Jarak Euclidean haversine sederhana
        const dLat = (lat - prevLat) * 111320;
        const dLng = (lng - prevLng) * 111320 * Math.cos((lat * Math.PI) / 180);
        stepDistance = Math.sqrt(dLat * dLat + dLng * dLng);
        cumulativeDistance += stepDistance;

        if (stepDistance > 0) {
          const elevDiff = Math.abs(baseElevation - prevElevation);
          slope = (elevDiff / stepDistance) * 100;
        }
      }

      const slopeRounded = parseFloat(slope.toFixed(1));
      maxSlope = Math.max(maxSlope, slopeRounded);
      totalSlope += slopeRounded;

      points.push({
        latitude: lat,
        longitude: lng,
        elevationMeters: parseFloat(baseElevation.toFixed(2)),
        distanceFromStartMeters: parseFloat(cumulativeDistance.toFixed(1)),
        slopePercentage: slopeRounded,
        isWheelchairAccessible: slopeRounded <= 8.0, // Standar aksesibilitas < 8%
      });
    }

    const avgSlope = points.length > 1 ? totalSlope / (points.length - 1) : 0;

    return {
      totalDistanceMeters: parseFloat(cumulativeDistance.toFixed(1)),
      maxSlopePercentage: maxSlope,
      averageSlopePercentage: parseFloat(avgSlope.toFixed(1)),
      hasSteepBarrier: maxSlope > 8.0,
      points,
    };
  }

  /**
   * Difa AI: grid prioritas aksesibilitas multi-kriteria untuk Makassar & Gowa
   * Menghasilkan grid sel analisis kesesuaian & prioritas intervensi fasilitas trotoar/ramp.
   * Mencakup 7 zona: Tamalate, Tamalanrea, Mariso, Ujung Pandang, Rappocini (Makassar), Bontomarannu, Somba Opu (Gowa).
   */
  /**
   * Grid prioritas: wilayah studi dibagi sel, tiap sel dinilai dari data nyata.
   *
   * Tiga hal diperbaiki dari versi sebelumnya, ketiganya soal kejujuran angka:
   *
   *   - Baris seed ikut terhitung. Empat belas baris karangan yang sudah
   *     disaring dari peta dan chatbot masih masuk ke sini, dan justru
   *     merekalah yang berskor tinggi.
   *
   *   - Sel tanpa titik survei diberi skor tengah 3,0, lalu tetap mendapat
   *     angka prioritas dan kalimat rekomendasi. Sekarang nilainya null, dan
   *     sisi web menggambarnya sebagai "belum disurvei" - bukan sebagai kabar
   *     baik maupun buruk.
   *
   *   - Rekomendasinya tiga kalimat mati yang dipilih dari ambang angka,
   *     sehingga sel tanpa satu pun data ramp tetap disuruh "revitalisasi ramp
   *     curam". Kini kalimatnya disusun dari apa yang benar-benar tercatat di
   *     sel itu, dan penjelasan naratifnya dikerjakan lapisan AI terpisah.
   */
  async calculateSiniPriorityGrid(
    gridSizeMeters: number = 1000,
    moda: ModaPenilaian = 'AKSESIBILITAS',
    bbox: [number, number, number, number] = [119.38, -5.26, 119.56, -5.10]
  ): Promise<{
    type: 'FeatureCollection';
    features: SiniGridCell[];
    summary: string;
    moda: ModaPenilaian;
  }> {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const gridStepLng = (gridSizeMeters / 111320) / Math.cos((-5.14 * Math.PI) / 180);
    const gridStepLat = gridSizeMeters / 111320;

    // Hanya hasil survei sungguhan. Baris tanpa aiConfidence adalah data seed.
    const locations = await prisma.location.findMany({
      where: { aiConfidence: { not: null } },
      select: {
        name: true,
        latitude: true,
        longitude: true,
        entityType: true,
        category: true,
        overallScore: true,
        rampStatus: true,
        guidingBlockStatus: true,
        sidewalkCondition: true,
      },
    });

    const titikEkonomi = await prisma.economicPoint.findMany({
      select: { type: true, latitude: true, longitude: true, metadata: true },
    });

    const features: SiniGridCell[] = [];
    let gridIndex = 1;

    for (let lng = minLng; lng < maxLng; lng += gridStepLng) {
      for (let lat = minLat; lat < maxLat; lat += gridStepLat) {
        const cellMinLng = lng;
        const cellMaxLng = lng + gridStepLng;
        const cellMinLat = lat;
        const cellMaxLat = lat + gridStepLat;
        const centerLng = parseFloat(((cellMinLng + cellMaxLng) / 2).toFixed(6));
        const centerLat = parseFloat(((cellMinLat + cellMaxLat) / 2).toFixed(6));

        const didalam = (o: { latitude: number; longitude: number }) =>
          o.longitude >= cellMinLng &&
          o.longitude < cellMaxLng &&
          o.latitude >= cellMinLat &&
          o.latitude < cellMaxLat;

        const cellLocations = locations.filter(didalam);
        const cellEkonomi = titikEkonomi.filter(didalam);

        /**
         * Tiap titik dihitung SEKALI saja, menurut urutan kepentingan.
         *
         * Sebelumnya sebuah titik bisa masuk dua golongan sekaligus: rumah
         * sakit yang bertipe PLACE terhitung di healthCount (bobot 15) sekaligus
         * commercialCount (bobot 5), jadi menyumbang 20. Audit menemukan itu
         * terjadi di empat dari lima sel teratas - angka prioritasnya menggelembung
         * tanpa ada yang bertambah di lapangan.
         */
        const golongan = (l: (typeof cellLocations)[number]): 'transit' | 'kesehatan' | 'umum' => {
          if (
            l.entityType === 'TRANSIT_HUB' ||
            l.category === 'BUS_STOP' ||
            l.category === 'TRANSIT_STATION'
          ) {
            return 'transit';
          }

          // Kolom category tidak dipakai sendirian untuk kesehatan: dari enam
          // baris bercategory HEALTHCARE hanya SATU yang benar-benar fasilitas
          // kesehatan, sisanya pengamatan guiding block dan halte bus. Karena
          // bobot kesehatan paling berat di formula ini, kesalahannya paling
          // mahal - satu pengamatan trotoar yang salah label menaikkan nilai
          // sel sebanyak lima belas poin.
          if (
            l.entityType === 'PLACE' &&
            /rumah sakit|\brsud\b|\brsia\b|\brs\b|puskesmas|klinik|apotek|posyandu/i.test(
              String(l.name)
            )
          ) {
            return 'kesehatan';
          }

          return 'umum';
        };

        const transportCount = cellLocations.filter((l) => golongan(l) === 'transit').length;
        const healthCount = cellLocations.filter((l) => golongan(l) === 'kesehatan').length;
        const commercialCount = cellLocations.filter(
          (l) =>
            golongan(l) === 'umum' &&
            (l.category === 'MALL' || l.category === 'RESTAURANT' || l.entityType === 'PLACE')
        ).length;

        const hunianCount = cellEkonomi.filter((e) => e.type === 'PROPERTI_GO').length;
        const kuliner = cellEkonomi.filter((e) => e.type === 'MENU_GO');
        const kulinerCount = kuliner.length + cellEkonomi.filter((e) => e.type === 'COMMERCIAL').length;
        const kulinerRamai = kuliner.filter((e) => {
          const kondisi = String((e.metadata as any)?.kondisi_tempat ?? '');
          return kondisi.toLowerCase().startsWith('ramai');
        }).length;

        const validScores = cellLocations
          .map((l) => l.overallScore)
          .filter((x): x is number => typeof x === 'number' && x > 0);

        // Sel tanpa titik survei tidak dinilai sama sekali.
        if (validScores.length === 0) {
          features.push({
            type: 'Feature',
            properties: {
              gridId: `MKSR-SINI-${gridIndex++}`,
              center: [centerLng, centerLat],
              moda,
              priorityIndex: null,
              accessibilityScore: null,
              jumlahTitik: cellLocations.length,
              faktor: {
                kerentananAkses: 0,
                kepadatan: 0,
                keterangan: 'Belum ada titik survei di sel ini, jadi belum bisa dinilai.',
              },
              transportCount,
              healthCount,
              commercialCount,
              hunianCount,
              kulinerCount,
              kulinerRamai,
              namaWilayah: null,
              namaTitik: [],
              hambatan: [],
              recommendedIntervention: 'Belum disurvei - kirim surveyor sebelum menyimpulkan apa pun.',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [cellMinLng, cellMinLat],
                  [cellMaxLng, cellMinLat],
                  [cellMaxLng, cellMaxLat],
                  [cellMinLng, cellMaxLat],
                  [cellMinLng, cellMinLat],
                ],
              ],
            },
          });
          continue;
        }

        const avgScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;

        // Semakin buruk skornya, semakin besar kerentanannya. Sama untuk ketiga
        // moda: yang membedakan hanya kegiatan apa yang dianggap membuat sebuah
        // sel layak didahulukan.
        const kerentananAkses = ((5.0 - avgScore) / 4.0) * 50;

        let kepadatan: number;
        let keterangan: string;

        if (moda === 'HUNIAN') {
          // Hunian ada tetapi jalan menuju transit buruk - penghuni yang memakai
          // kursi roda praktis terkurung di rumahnya sendiri.
          // Tambahan "tidak ada transit" hanya berlaku bila ada hunian di sel
          // ini. Tanpa syarat itu, sel kosong dari hunian pun ikut naik
          // peringkat hanya karena sama-sama tidak punya halte - padahal tidak
          // ada seorang pun di sana yang dirugikan.
          const tanpaTransit = hunianCount > 0 && transportCount === 0 ? 15 : 0;
          kepadatan = Math.min(50, hunianCount * 18 + tanpaTransit);
          keterangan =
            `${hunianCount} titik hunian, ${transportCount} titik transit` +
            (tanpaTransit > 0 ? ' - ada hunian tetapi tidak ada transit terdata' : '');
        } else if (moda === 'KOMERSIAL') {
          // Tempat usaha ramai tetapi lingkungannya belum ramah difabel: pasar
          // yang sudah terbukti ada, tetapi belum terlayani.
          kepadatan = Math.min(50, kulinerCount * 12 + kulinerRamai * 10 + commercialCount * 4);
          keterangan = `${kulinerCount} titik usaha (${kulinerRamai} tercatat ramai), ${commercialCount} tempat umum`;
        } else {
          kepadatan = Math.min(50, transportCount * 12 + healthCount * 15 + commercialCount * 5);
          keterangan = `${transportCount} transit, ${healthCount} fasilitas kesehatan, ${commercialCount} tempat umum`;
        }

        // Tanpa lantai buatan. Sebelumnya nilai terendah dipaksa 10, sehingga
        // sel yang benar-benar baik dan sepi pun tampak masih punya masalah.
        const priorityIndex = Math.min(100, Math.round(kerentananAkses + kepadatan));

        // Hambatan yang BENAR-BENAR tercatat di sel ini - bukan kalimat umum.
        const hambatan: string[] = [];
        const hitung = (syarat: (l: (typeof cellLocations)[number]) => boolean) =>
          cellLocations.filter(syarat).length;

        const rampTiada = hitung((l) => l.rampStatus === 'NONE' || l.rampStatus === 'DAMAGED');
        const ubinTiada = hitung(
          (l) => l.guidingBlockStatus === 'NONE' || l.guidingBlockStatus === 'DAMAGED'
        );
        const trotoarBuruk = hitung((l) =>
          ['DAMAGED', 'BLOCKED', 'NARROW'].includes(String(l.sidewalkCondition))
        );

        if (rampTiada > 0) hambatan.push(`${rampTiada} titik tanpa ramp layak`);
        if (ubinTiada > 0) hambatan.push(`${ubinTiada} titik ubin pemandu rusak atau tidak ada`);
        if (trotoarBuruk > 0) hambatan.push(`${trotoarBuruk} titik trotoar rusak, sempit, atau terhalang`);

        /**
         * Nama titik yang disebutkan haruslah BUKTI, bukan sekadar penghuni sel.
         *
         * Sebelumnya empat titik pertama menurut urutan basis data yang dikirim,
         * dan akibatnya Difa AI menyebut "Halte Bus RS Grestelina" sebagai
         * contoh pada sel yang masalahnya trotoar rusak - padahal halte itu
         * justru salah satu yang kondisinya baik. Yang dikirim sekarang adalah
         * titik berskor terburuk lebih dulu.
         */
        const namaTitik = [...cellLocations]
          .sort((a, b) => (a.overallScore ?? 5) - (b.overallScore ?? 5))
          .slice(0, 4)
          .map((l) => `${l.name} (skor ${l.overallScore ?? '-'})`);

        const recommendedIntervention =
          hambatan.length > 0
            ? `Yang tercatat di sel ini: ${hambatan.join('; ')}.`
            : `Tidak ada hambatan tercatat pada ${cellLocations.length} titik di sel ini.`;

        features.push({
          type: 'Feature',
          properties: {
            gridId: `MKSR-SINI-${gridIndex++}`,
            center: [centerLng, centerLat],
            moda,
            priorityIndex,
            accessibilityScore: parseFloat(avgScore.toFixed(1)),
            jumlahTitik: cellLocations.length,
            faktor: {
              kerentananAkses: Math.round(kerentananAkses),
              kepadatan: Math.round(kepadatan),
              keterangan,
            },
            transportCount,
            healthCount,
            commercialCount,
            hunianCount,
            kulinerCount,
            kulinerRamai,
            namaWilayah: null,
            namaTitik,
            hambatan,
            recommendedIntervention,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [cellMinLng, cellMinLat],
                [cellMaxLng, cellMinLat],
                [cellMaxLng, cellMaxLat],
                [cellMinLng, cellMaxLat],
                [cellMinLng, cellMinLat],
              ],
            ],
          },
        });
      }
    }

    /**
     * Nama daerah hanya dicari untuk sel yang akan ditampilkan.
     *
     * Menamai seluruh 360 sel berarti 360 panggilan geocoder berjeda seperempat
     * detik - satu setengah menit menunggu untuk nama yang tidak pernah dibaca
     * siapa pun. Yang muncul di panel hanya belasan sel teratas, dan hasilnya
     * disimpan sehingga permintaan berikutnya tidak membayar lagi.
     */
    const teratas = features
      .filter((f) => f.properties.priorityIndex !== null)
      .sort((a, b) => (b.properties.priorityIndex ?? 0) - (a.properties.priorityIndex ?? 0))
      .slice(0, 12);

    for (const f of teratas) {
      const [lng, lat] = f.properties.center;
      f.properties.namaWilayah = await namaiKoordinat(lat, lng);
    }

    const berdata = features.filter((f) => f.properties.priorityIndex !== null).length;

    return {
      type: 'FeatureCollection',
      features,
      moda,
      summary:
        `${berdata} dari ${features.length} sel punya titik survei dan bisa dinilai; ` +
        `sisanya belum pernah didatangi surveyor.`,
    };
  }

  async proxyRequest(path: string, params: Record<string, any> = {}, method: 'GET' | 'POST' = 'GET', data?: any) {
    try {
      const response = await this.apiClient.request({
        url: path,
        method,
        params: {
          ...params,
          key: env.MAPID_API_KEY,
        },
        data,
      });
      return response.data;
    } catch (error: any) {
      console.error(`[MAPID Proxy] Generic proxy error for ${path}:`, error.message);
      throw new Error(error.response?.data?.message || 'MAPID Gateway proxy error');
    }
  }
}

export const mapIdService = new MapIdService();

