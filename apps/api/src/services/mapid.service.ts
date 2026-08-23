import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.js';

class MapIdService {
  private apiClient: AxiosInstance;
  private basemapClient: AxiosInstance;

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
  }

  /**
   * Mengambil Mapbox/MapLibre Style JSON dari MAPID
   * Endpoint format: https://basemap.mapid.io/styles/{styleId}/style.json?key={API_KEY}
   */
  async getMapStyle(styleId: string) {
    try {
      const response = await this.basemapClient.get(`/styles/${styleId}/style.json`, {
        params: {
          key: env.MAPID_API_KEY,
        },
      });

      const styleJson = response.data;

      // Jika URL vector/raster tile di dalam style.json menyertakan key atau format relatif,
      // kita pastikan key terinjeksi dengan aman tanpa membocorkannya ke browser
      return styleJson;
    } catch (error: any) {
      console.error(`[MAPID Proxy] Error fetching style ${styleId}:`, error.message);
      throw new Error(error.response?.data?.message || `Failed to fetch MAPID map style for '${styleId}'`);
    }
  }

  /**
   * Mengambil layer data spasial Activity / Community Maps dari MAPID
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
   * Mengambil data GeoJSON dari MAPID Activity Map
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
