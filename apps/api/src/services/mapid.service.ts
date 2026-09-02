import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

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
   * Mengambil Mapbox/MapLibre Style JSON dari MAPID Basemap (dengan in-memory caching)
   * Endpoint: https://basemap.mapid.io/styles/{styleId}/style.json?key={API_KEY}
   */
  async getMapStyle(styleId: string) {
    const cacheKey = `style_${styleId}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.basemapClient.get(`/styles/${styleId}/style.json`, {
        params: {
          key: env.MAPID_API_KEY,
        },
      });
      this.setCached(cacheKey, response.data, 1800); // Cache 30 menit
      return response.data;
    } catch (error: any) {
      console.error(`[MAPID Proxy] Error fetching style ${styleId}:`, error.message);
      throw new Error(error.response?.data?.message || `Failed to fetch MAPID map style for '${styleId}'`);
    }
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
      // JANGAN kembalikan data cadangan buatan di sini. Kegagalan harus terlihat,
      // supaya salah API key / endpoint tidak menyamar sebagai integrasi yang berhasil.
      console.error('[MAPID Geoserver] Error fetching project layer list:', error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch MAPID project layer list');
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

