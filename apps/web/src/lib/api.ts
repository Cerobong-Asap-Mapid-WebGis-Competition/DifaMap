/**
 * DifaMap API Client Helper
 * Menghubungkan frontend Next.js ke backend Express (termasuk MAPID Proxy yang aman)
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface LocationFilterParams {
  entityType?: 'PLACE' | 'SIDEWALK' | 'TRANSIT_HUB';
  category?: string;
  wheelchairOnly?: boolean;
  visuallyImpairedOnly?: boolean;
  minScore?: number;
  lighting?: string;
  crowd?: string;
  sidewalkCondition?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateActivityPayload {
  title: string;
  description: string;
  mediaUrls: string[];
  specificLocation?: string;
  latitude: number;
  longitude: number;
  locationId?: string | null;
  status?: 'DRAFT' | 'PUBLIC';
  accessibilityTags?: string[];
  userObservedHints?: {
    rampStatus?: 'GOOD' | 'DAMAGED' | 'NONE';
    guidingBlockStatus?: 'GOOD' | 'DAMAGED' | 'NONE';
    sidewalkCondition?: 'GOOD' | 'NARROW' | 'DAMAGED' | 'BLOCKED';
    surfaceCondition?: 'SMOOTH' | 'SLIPPERY' | 'POTHOLE' | 'UNEVEN';
    lightingLevel?: 'BRIGHT' | 'DIM' | 'DARK';
  };
}

export const difaMapApi = {
  /**
   * Mengambil URL MAPID Style via backend proxy
   */
  getMapStyleUrl(styleId: string = 'basic'): string {
    return `${API_BASE_URL}/api/mapid/styles/${styleId}`;
  },

  /**
   * Mengambil daftar tempat / trotoar dengan filter reaktif
   */
  async getLocations(params: LocationFilterParams = {}) {
    const query = new URLSearchParams();
    if (params.entityType) query.append('entityType', params.entityType);
    if (params.category) query.append('category', params.category);
    if (params.wheelchairOnly) query.append('wheelchairOnly', 'true');
    if (params.visuallyImpairedOnly) query.append('visuallyImpairedOnly', 'true');
    if (params.minScore) query.append('minScore', params.minScore.toString());
    if (params.lighting) query.append('lighting', params.lighting);
    if (params.crowd) query.append('crowd', params.crowd);
    if (params.sidewalkCondition) query.append('sidewalkCondition', params.sidewalkCondition);
    if (params.search) query.append('search', params.search);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    const res = await fetch(`${API_BASE_URL}/api/locations?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch locations');
    return res.json();
  },

  /**
   * Mengambil detail satu lokasi / trotoar
   */
  async getLocationById(id: string) {
    const res = await fetch(`${API_BASE_URL}/api/locations/${id}`);
    if (!res.ok) throw new Error('Failed to fetch location detail');
    return res.json();
  },

  /**
   * Mengambil feed aktivitas komunitas
   */
  async getActivities(params: { locationId?: string; search?: string; status?: string } = {}) {
    const query = new URLSearchParams();
    if (params.locationId) query.append('locationId', params.locationId);
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);

    const res = await fetch(`${API_BASE_URL}/api/activities?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch activities');
    return res.json();
  },

  /**
   * Mengambil detail postingan aktivitas
   */
  async getActivityById(id: string) {
    const res = await fetch(`${API_BASE_URL}/api/activities/${id}`);
    if (!res.ok) throw new Error('Failed to fetch activity detail');
    return res.json();
  },

  /**
   * Membuat postingan aktivitas baru (Wajib Login)
   */
  async createActivity(payload: CreateActivityPayload, token: string) {
    const res = await fetch(`${API_BASE_URL}/api/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Failed to post activity');
    }
    return res.json();
  },

  /**
   * Mengirim pertanyaan ke Asisten Aksesibilitas Chatbot (Spatial RAG)
   */
  async chatWithAi(message: string, userLocation?: { latitude: number; longitude: number }, selectedLocationId?: string, history?: any[]) {
    const res = await fetch(`${API_BASE_URL}/api/chatbot/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, userLocation, selectedLocationId, history }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to chat with AI');
    }
    return res.json();
  },

  /**
   * Mengambil layer proyek aktif dari MAPID Geoserver Open API
   */
  async getMapIdProjectLayers() {
    const res = await fetch(`${API_BASE_URL}/api/mapid/project/layers`);
    if (!res.ok) throw new Error('Failed to fetch MAPID project layers');
    return res.json();
  },

  /**
   * MAP Analysis: Menghitung Poligon Isokron (5, 10, 15 menit)
   */
  async getIsochrone(lat: number, lng: number, intervals = [5, 10, 15], mode: 'walking' | 'wheelchair' = 'wheelchair') {
    const res = await fetch(`${API_BASE_URL}/api/mapid/analysis/isochrone?lat=${lat}&lng=${lng}&intervals=${intervals.join(',')}&mode=${mode}`);
    if (!res.ok) throw new Error('Failed to calculate isochrone');
    return res.json();
  },

  /**
   * MAP Analysis: Menghitung Elevasi & Kelandaian Tanjakan (Slope Analysis)
   */
  async getElevationSlope(coordinates: Array<[number, number]>) {
    const res = await fetch(`${API_BASE_URL}/api/mapid/analysis/elevation-slope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates }),
    });
    if (!res.ok) throw new Error('Failed to calculate slope profile');
    return res.json();
  },

  /**
   * MAPID SINI AI: Mengambil Grid Heatmap Prioritas Wilayah Makassar
   */
  async getSiniGridPriority(gridSize = 1000) {
    const res = await fetch(`${API_BASE_URL}/api/mapid/analysis/sini-grid?gridSize=${gridSize}`);
    if (!res.ok) throw new Error('Failed to fetch SINI grid');
    return res.json();
  },
};

