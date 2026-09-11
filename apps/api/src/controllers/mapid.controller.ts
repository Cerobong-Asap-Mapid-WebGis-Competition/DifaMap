import { Request, Response } from 'express';
import { z } from 'zod';
import { mapIdService } from '../services/mapid.service.js';

export async function getMapStyleController(req: Request, res: Response): Promise<void> {
  try {
    const styleId = String(req.params.styleId || 'basic');

    const styleData = await mapIdService.getMapStyle(styleId);

    // Cache-Control header agar browser selalu meminta basemap style terbaru dari proxy
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(styleData);
  } catch (error: any) {
    res.status(502).json({
      error: 'Bad Gateway - MAPID Service Error',
      message: error.message,
    });
  }
}

/**
 * Mengambil daftar layer proyek DifaMap dari MAPID Geoserver
 */
export async function getProjectLayersController(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.query;
    const layers = await mapIdService.getProjectLayers(projectId as string | undefined);

    res.json({
      success: true,
      data: layers,
    });
  } catch (error: any) {
    res.status(502).json({
      error: 'Bad Gateway - MAPID Geoserver Layer List Error',
      message: error.message,
    });
  }
}

export async function getActivityLayersController(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.query;
    const layers = await mapIdService.getActivityLayers(projectId as string | undefined);
    res.json({
      success: true,
      data: layers,
    });
  } catch (error: any) {
    res.status(502).json({
      error: 'Bad Gateway - MAPID Layer Error',
      message: error.message,
    });
  }
}

export async function getLayerGeoJSONController(req: Request, res: Response): Promise<void> {
  try {
    const layerId = String(req.params.layerId);
    if (!layerId) {
      res.status(400).json({ error: 'layerId parameter is required' });
      return;
    }

    const geojson = await mapIdService.getLayerGeoJSON(layerId);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(geojson);
  } catch (error: any) {
    res.status(502).json({
      error: 'Bad Gateway - MAPID GeoJSON Error',
      message: error.message,
    });
  }
}

/**
 * MAP Analysis Tool: Menghitung Poligon Isokron (Catchment 5, 10, 15 menit)
 */
export async function getIsochroneCatchmentController(req: Request, res: Response): Promise<void> {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const mode = (req.query.mode as string) === 'walking' ? 'walking' : 'wheelchair';
    const intervalsQuery = req.query.intervals as string;

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
      return;
    }

    const intervals = intervalsQuery
      ? intervalsQuery.split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n))
      : [5, 10, 15];

    const isochroneData = mapIdService.calculateIsochroneCatchment(lat, lng, intervals, mode);

    res.json({
      success: true,
      data: isochroneData,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to compute isochrone', message: error.message });
  }
}

const elevationQuerySchema = z.object({
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2, 'At least 2 coordinates are required'),
});

/**
 * MAP Analysis Tool: Menghitung Elevasi & Kelandaian (Slope Gradient Profiling)
 */
export async function getElevationSlopeController(req: Request, res: Response): Promise<void> {
  try {
    const validated = elevationQuerySchema.parse(req.body);
    const slopeData = mapIdService.calculateElevationSlopeProfile(validated.coordinates);

    res.json({
      success: true,
      data: slopeData,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to compute elevation slope profile', message: error.message });
  }
}

/**
 * Difa AI: grid analisis kesesuaian & prioritas aksesibilitas Makassar
 */
export async function getSiniGridPriorityController(req: Request, res: Response): Promise<void> {
  try {
    const gridSize = parseInt(req.query.gridSize as string, 10) || 1000;
    const gridData = await mapIdService.calculateSiniPriorityGrid(gridSize);

    res.json({
      success: true,
      data: gridData,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to compute SINI grid analysis', message: error.message });
  }
}

export async function genericMapIdProxyController(req: Request, res: Response): Promise<void> {
  try {
    const targetPath = req.params[0] ? `/${req.params[0]}` : '/';
    const result = await mapIdService.proxyRequest(
      targetPath,
      req.query as Record<string, any>,
      req.method as 'GET' | 'POST',
      req.body
    );
    res.json(result);
  } catch (error: any) {
    res.status(502).json({
      error: 'MAPID Proxy Failed',
      message: error.message,
    });
  }
}

