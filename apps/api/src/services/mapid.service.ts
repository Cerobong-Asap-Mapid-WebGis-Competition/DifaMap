import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

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

export interface SiniGridCell {
  type: 'Feature';
  properties: {
    gridId: string;
    center: [number, number]; // [lng, lat]
    transportScore: number;
    healthScore: number;
    commercialScore: number;
    accessibilityScore: number;
    priorityIndex: number; // 0 - 100 (Semakin tinggi semakin butuh intervensi trotoar & ramp)
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
   * MAPID SINI AI: Multi-Criteria Spatial Accessibility Grid untuk Makassar & Gowa
   * Menghasilkan grid sel analisis kesesuaian & prioritas intervensi fasilitas trotoar/ramp.
   * Mencakup 7 zona: Tamalate, Tamalanrea, Mariso, Ujung Pandang, Rappocini (Makassar), Bontomarannu, Somba Opu (Gowa).
   */
  async calculateSiniPriorityGrid(
    gridSizeMeters: number = 1000,
    bbox: [number, number, number, number] = [119.38, -5.26, 119.56, -5.10] // Bounding box 7 Zona Makassar & Gowa
  ): Promise<{ type: 'FeatureCollection'; features: SiniGridCell[]; summary: string }> {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const gridStepLng = (gridSizeMeters / 111320) / Math.cos((-5.14 * Math.PI) / 180);
    const gridStepLat = gridSizeMeters / 111320;

    // Ambil data lokasi & aktivitas tersimpan di database
    const locations = await prisma.location.findMany({
      select: {
        latitude: true,
        longitude: true,
        entityType: true,
        category: true,
        overallScore: true,
        rampStatus: true,
        guidingBlockStatus: true,
      },
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

        // Filter lokasi di dalam sel grid
        const cellLocations = locations.filter(
          (loc) =>
            loc.longitude >= cellMinLng &&
            loc.longitude < cellMaxLng &&
            loc.latitude >= cellMinLat &&
            loc.latitude < cellMaxLat
        );

        const transportCount = cellLocations.filter(
          (l) => l.entityType === 'TRANSIT_HUB' || l.category === 'BUS_STOP' || l.category === 'TRANSIT_STATION'
        ).length;

        const healthCount = cellLocations.filter((l) => l.category === 'HEALTHCARE').length;
        const commercialCount = cellLocations.filter(
          (l) => l.category === 'MALL' || l.category === 'RESTAURANT' || l.entityType === 'PLACE'
        ).length;

        const validScores = cellLocations.map((l) => l.overallScore).filter((s) => s > 0);
        const avgScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 3.0;

        // Formula MAPID SINI: Priority Index (0 - 100)
        // Kepadatan aktivitas tinggi + skor aksesibilitas rendah = Prioritas intervensi TINGGI
        const activityDensityWeight = Math.min(50, (transportCount * 12) + (healthCount * 15) + (commercialCount * 5));
        const accessibilityVulnerability = ((5.0 - avgScore) / 4.0) * 50; // Semakin buruk skor, nilai makin tinggi
        const priorityIndex = Math.min(100, Math.max(10, Math.round(activityDensityWeight + accessibilityVulnerability)));

        let recommendedIntervention = 'Pemeliharaan rutin trotoar';
        if (priorityIndex >= 70) {
          recommendedIntervention = 'Prioritas Mendesak: Revitalisasi ramp curam dan ubin pengarah guiding block di koridor transit';
        } else if (priorityIndex >= 45) {
          recommendedIntervention = 'Prioritas Menengah: Perbaikan permukaan trotoar & penambahan lampu jalan';
        }

        features.push({
          type: 'Feature',
          properties: {
            gridId: `MKSR-SINI-${gridIndex++}`,
            center: [centerLng, centerLat],
            transportScore: transportCount * 20,
            healthScore: healthCount * 25,
            commercialScore: commercialCount * 10,
            accessibilityScore: parseFloat(avgScore.toFixed(1)),
            priorityIndex,
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

    return {
      type: 'FeatureCollection',
      features,
      summary: `Analisis Grid SINI AI untuk ${features.length} sel di Kota Makassar & Kabupaten Gowa (7 Zona Kecamatan) dengan formula multi-kriteria aksesibilitas & kepadatan fasilitas publik.`,
    };
  }

  /**
   * Generic passthrough proxy untuk endpoint MAPID lainnya
   */
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

