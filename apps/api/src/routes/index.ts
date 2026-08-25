import { Router } from 'express';
import mapidRoutes from './mapid.routes.js';
import locationRoutes from './location.routes.js';
import activityRoutes from './activity.routes.js';
import commentRoutes from './comment.routes.js';
import chatbotRoutes from './chatbot.routes.js';

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
apiRouter.use('/mapid', mapidRoutes);

export default apiRouter;

