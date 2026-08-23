/**
 * DifaMap API Client Helper
 * Menghubungkan frontend Next.js ke backend Express (termasuk MAPID Proxy yang aman)
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface AccessibilityReportPayload {
  locationId: string;
  description: string;
  userScore: number;
  photoUrl?: string;
  userId?: string;
}

export const difaMapApi = {
  /**
   * Mengambil URL MAPID Style via backend proxy (tanpa membocorkan MAPID_API_KEY ke browser)
   */
  getMapStyleUrl(styleId: string): string {
    return `${API_BASE_URL}/api/mapid/styles/${styleId}`;
  },

  /**
   * Mengambil daftar titik transit/lokasi beserta skor prioritas
   */
  async getLocations() {
    const res = await fetch(`${API_BASE_URL}/api/locations`);
    if (!res.ok) throw new Error('Failed to fetch locations');
    return res.json();
  },

  /**
   * Mengirim laporan masyarakat ke AI Orchestrator backend
   */
  async submitReport(payload: AccessibilityReportPayload, token?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE_URL}/api/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to submit accessibility report');
    }

    return res.json();
  },

  /**
   * Menghitung ulang skor buffer ekonomi titik 500m melalui PostGIS RPC
   */
  async recalculateEconomicBuffer(locationId: string, radius = 500) {
    const res = await fetch(`${API_BASE_URL}/api/locations/${locationId}/economic-buffer?radius=${radius}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to calculate economic buffer');
    return res.json();
  },
};
