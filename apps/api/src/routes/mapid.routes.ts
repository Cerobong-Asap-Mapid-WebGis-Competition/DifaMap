import { Router } from 'express';
import {
  getMapStyleController,
  getProjectLayersController,
  getActivityLayersController,
  getLayerGeoJSONController,
  getIsochroneCatchmentController,
  getElevationSlopeController,
  getSiniGridPriorityController,
  genericMapIdProxyController,
} from '../controllers/mapid.controller.js';
import {
  getCompetitionActivitiesController,
  getSurveyActivitiesController,
  getCompetitionMissionsController,
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

// 5. MAP Analysis Tools - Isokron (Catchment Waktu Tempuh 5, 10, 15 Menit)
router.get('/analysis/isochrone', getIsochroneCatchmentController);

// 6. MAP Analysis Tools - Profil Ketinggian & Kelandaian (Slope Analysis)
router.post('/analysis/elevation-slope', getElevationSlopeController);

// 7. Grid prioritas aksesibilitas Difa AI (multi-kriteria)
router.get('/analysis/sini-grid', getSiniGridPriorityController);

// 8. MAPID Competition API - Community Maps (data survei aksesibilitas)
router.post('/competition/activities', getCompetitionActivitiesController);

// 8b. Data survei RESMI: disaring ke anggota tim Cerobong Asap
router.post('/competition/survey', getSurveyActivitiesController);

// 9. MAPID Competition API - Mission (menugo | propertigo | struckgo)
router.post('/competition/missions/:missionType', getCompetitionMissionsController);

// 10. Wildcard passthrough proxy untuk endpoint MAPID lainnya
router.all('/proxy/*', genericMapIdProxyController);

export default router;

