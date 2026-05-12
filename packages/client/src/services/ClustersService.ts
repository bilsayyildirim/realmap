import { useService } from '@/hooks/useService';
import { Clusters } from '@realmap/shared';
import { BaseService } from './BaseService';

interface ClustersResponse {
  clusters: Clusters[];
  total: number;
  page: number;
  totalPages: number;
}

interface ClustersQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  fields?: string[];
}

export class ClustersService extends BaseService {
  constructor(...args: ConstructorParameters<typeof BaseService>) {
    super(...args);
  }

  // Search for places with minimal fields for the map
  async searchClusters(
    params: ClustersQueryParams = {},
  ): Promise<ClustersResponse> {
    const {
      fields = ['id', 'ingredients', 'cookingMethods', 'clusters'],
      page,
      limit,
      ...rest
    } = params;
    // Calculate offset if page and limit are provided
    let offset: number | undefined = undefined;
    let finalLimit = limit;
    if (typeof page === 'number' && typeof limit === 'number') {
      offset = (page - 1) * limit;
      finalLimit = limit;
    }
    return this.fetch<ClustersResponse>('/clusters', {
      params: {
        ...rest,
        ...(offset !== undefined ? { offset } : {}),
        ...(finalLimit !== undefined ? { limit: finalLimit } : {}),
        fields: fields.join(','),
      },
    });
  }

  // Fetch a single place by ID (for hover preview)
  async getClustersById(id: string): Promise<Clusters> {
    return this.fetch<Clusters>(`/clusters/${id}`);
  }
}

export const { useSearchClusters, useGetClustersById } =
  useService(ClustersService);
