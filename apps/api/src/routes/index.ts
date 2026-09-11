import { Router } from 'express';
import mapidRoutes from './mapid.routes.js';
import locationRoutes from './location.routes.js';
import activityRoutes from './activity.routes.js';
import commentRoutes from './comment.routes.js';
import chatbotRoutes from './chatbot.routes.js';
import economicPointRoutes from './economicPoint.routes.js';
import geocodeRoutes from './geocode.routes.js';

const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DifaMap API Service (Makassar WebGIS)',
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use('/locations', locationRoutes);
apiRouter.use('/activities', activityRoutes);
apiRouter.use('/comments', commentRoutes);
apiRouter.use('/chatbot', chatbotRoutes);
apiRouter.use('/economic-points', economicPointRoutes);
apiRouter.use('/mapid', mapidRoutes);

// Pencarian tempat di luar basis data DifaMap (Nominatim / OpenStreetMap)
apiRouter.use('/geocode', geocodeRoutes);

export default apiRouter;

