import { Client } from '@elastic/elasticsearch';
import {
  Clusters,
  ClustersSchema,
  IndexName,
  SearchParams,
  SearchResponseSchema,
} from '@realmap/shared';
import { Static } from '@sinclair/typebox';

const ClustersResponseSchema = SearchResponseSchema(ClustersSchema);
export type ClustersResponse = Static<typeof ClustersResponseSchema>;

interface ClustersHandler {
  searchClusters(params: SearchParams): Promise<ClustersResponse>;
  getClustersById(id: string): Promise<Clusters | null>;
}

const buildClustersHandlerInternal = (client: Client): ClustersHandler => {
  return {
    async searchClusters(params: SearchParams) {
      const { query, limit = 10, offset = 0, includes } = params;

      const must: any[] = [];

      if (query) {
        must.push({
          multi_match: {
            query,
            fields: ['id', 'ingredients', 'cookingMethods'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        });
      }
      const { hits } = await client.search<Clusters>({
        index: IndexName.CLUSTERS,
        size: Number(limit),
        from: Number(offset),
        track_total_hits: true,
        query: {
          bool: {
            must,
          },
        },
        _source: {
          includes: includes || [
            'id',
            'cookingMethods',
            'ingredients',
            'clusters',
            'createdAt',
            'updatedAt',
          ],
        },
      });

      const total =
        typeof hits.total === 'object' ? hits.total.value : hits.total || 0;

      return {
        items: hits.hits.map((hit) => hit._source as Clusters),
        total,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit),
      };
    },

    async getClustersById(id: string) {
      try {
        const { _source: clusters } = await client.get<Clusters>({
          index: IndexName.CLUSTERS,
          id,
        });
        return clusters as Clusters;
      } catch (error: any) {
        if (error.meta && error.meta.statusCode === 404) {
          return null;
        }
        throw error;
      }
    },
  };
};

export const buildClustersHandlers = (client: Client): ClustersHandler => {
  return buildClustersHandlerInternal(client);
};
