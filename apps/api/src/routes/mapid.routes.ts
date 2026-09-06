import { Router } from 'express';
import {
  getMapStyleController,
  getProjectLayersController,
  getActivityLayersController,
  getLayerGeoJSONController,
  genericMapIdProxyController,
} from '../controllers/mapid.controller.js';
import {
  getCompetitionActivitiesController,
  getCompetitionMissionsController,
  getSurveyActivitiesController,
} from '../controllers/mapidCompetition.controller.js';

const router = Router();

// 1. Basemap Style proxy (Untuk MapLibre / Mapbox GL JS di Frontend)
router.get('/styles/:styleId', getMapStyleController);

// 2. Daftar Layer Proyek dari MAPID Geoserver (Open API)
router.get('/project/layers', getProjectLayersController);

// 3. Activity Maps / Community Layers proxy
router.get('/layers', getActivityLayersController);

// 4. GeoJSON feature data proxy
router.get('/layers/:layerId/geojson', getLayerGeoJSONController);

// 5. MAPID Competition API - Community Maps (data survei aksesibilitas)
router.post('/competition/activities', getCompetitionActivitiesController);

// 5b. Data survei RESMI: sudah disaring ke anggota tim
router.post('/competition/survey', getSurveyActivitiesController);

// 6. MAPID Competition API - Mission (menugo | propertigo | struckgo)
router.post('/competition/missions/:missionType', getCompetitionMissionsController);

// 7. Wildcard passthrough proxy untuk endpoint MAPID lainnya
router.all('/proxy/*', genericMapIdProxyController);

export default router;

