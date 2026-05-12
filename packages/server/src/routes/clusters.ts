import { Client } from '@elastic/elasticsearch';
import { SearchParams, SearchParamsSchema } from '@realmap/shared';
import { Request, Response, Router } from 'express';
import {
  buildClustersHandlers,
  ClustersResponse,
} from '../services/clusters/handlers';
import { validateRequest } from '../utils/validateRequest';

export const buildClustersRouter = (client: Client) => {
  const router = Router();
  const handlers = buildClustersHandlers(client);

  // Search places
  router.get(
    '/',
    validateRequest({
      query: SearchParamsSchema,
    }),
    async (
      req: Request<{}, any, any, SearchParams>,
      res: Response<ClustersResponse>,
    ) => {
      try {
        const { query, limit = 10, offset = 0, includes, sort } = req.query;

        const clusters = await handlers.searchClusters({
          query,
          limit: typeof limit === 'string' ? parseInt(limit, 10) : limit,
          offset: typeof offset === 'string' ? parseInt(offset, 10) : offset,
          includes,
          sort,
        });

        res.json(clusters);
      } catch (error) {
        console.error('Error searching clusters:', error);
        res.status(500).json({ error: 'Failed to search clusters' });
      }
    },
  );

  // Get place by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const cluster = await handlers.getClustersById(id);
      if (!cluster) return res.status(404).json({ error: 'Not found' });
      res.json(cluster);
    } catch (error) {
      console.error('Error fetching place by ID:', error);
      res.status(500).json({ error: 'Failed to fetch place' });
    }
  });

  return router;
};
