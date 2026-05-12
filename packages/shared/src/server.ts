import { Client } from '@elastic/elasticsearch';

// Server-specific clients and utilities
export {
  buildElasticsearchClient,
  buildIndices,
} from './clients/elasticsearch';

export { Client as ElasticsearchClient };

// Types
export * from './types';

// Config
export * from './config/server';
