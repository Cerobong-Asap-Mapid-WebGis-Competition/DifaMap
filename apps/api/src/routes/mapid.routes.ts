import { Router } from 'express';
import {
  getMapStyleController,
  getActivityLayersController,
  getLayerGeoJSONController,
  genericMapIdProxyController,
} from '../controllers/mapid.controller.js';

const router = Router();

// 1. Basemap Style proxy (Untuk MapLibre / Mapbox GL JS di Frontend)
router.get('/styles/:styleId', getMapStyleController);

// 2. Activity Maps / Layers proxy
router.get('/layers', getActivityLayersController);

// 3. GeoJSON feature data proxy
router.get('/layers/:layerId/geojson', getLayerGeoJSONController);

// 4. Wildcard passthrough proxy untuk endpoint MAPID lainnya
router.all('/proxy/*', genericMapIdProxyController);

export default router;
