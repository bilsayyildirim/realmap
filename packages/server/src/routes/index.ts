import { Client } from '@elastic/elasticsearch';
import { Router } from 'express';
import { buildClustersRouter } from './clusters';

export const buildRouter = (client: Client) => {
  const router = Router();

  router.use('/clusters', buildClustersRouter(client));

  return router;
};
