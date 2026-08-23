import { Router } from 'express';
import mapidRoutes from './mapid.routes.js';
import reportRoutes from './report.routes.js';

const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DifaMap API Service',
    timestamp: new Date().toISOString(),
  });
});

apiRouter.use('/mapid', mapidRoutes);
apiRouter.use('/', reportRoutes);

export default apiRouter;
