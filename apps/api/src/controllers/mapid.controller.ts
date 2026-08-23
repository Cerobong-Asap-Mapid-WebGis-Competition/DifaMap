import { Request, Response } from 'express';
import { mapIdService } from '../services/mapid.service.js';

export async function getMapStyleController(req: Request, res: Response): Promise<void> {
  try {
    const styleId = req.params.styleId as string;
    if (!styleId) {
      res.status(400).json({ error: 'styleId is required' });
      return;
    }

    const styleData = await mapIdService.getMapStyle(styleId);

    // Cache-Control header agar browser/MapLibre tidak berulang kali memanggil basemap yang sama
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(styleData);
  } catch (error: any) {
    res.status(502).json({
      error: 'Bad Gateway - MAPID Service Error',
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
    const layerId = req.params.layerId as string;
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
