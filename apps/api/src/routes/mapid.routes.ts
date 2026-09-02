import { Router } from 'express';
import {
  getMapStyleController,
  getProjectLayersController,
  getActivityLayersController,
  getLayerGeoJSONController,
  genericMapIdProxyController,
} from '../controllers/mapid.controller.js';

const router = Router();

// 1. Basemap Style proxy (Untuk MapLibre / Mapbox GL JS di Frontend)
router.get('/styles/:styleId', getMapStyleController);

// 2. Daftar Layer Proyek dari MAPID Geoserver (Open API)
router.get('/project/layers', getProjectLayersController);

// 3. Activity Maps / Community Layers proxy
router.get('/layers', getActivityLayersController);

// 4. GeoJSON feature data proxy
router.get('/layers/:layerId/geojson', getLayerGeoJSONController);

// 5. Wildcard passthrough proxy untuk endpoint MAPID lainnya
router.all('/proxy/*', genericMapIdProxyController);

export default router;

