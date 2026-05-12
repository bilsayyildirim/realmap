import { Static, Type } from '@sinclair/typebox';
import { ClientConfigSchema, defaultConfig } from './client';

export const ElasticsearchConfigSchema = Type.Object({
  node: Type.String(),
  auth: Type.Object({
    username: Type.String(),
    password: Type.String(),
  }),
  index: Type.String(),
  settings: Type.Object({
    numberOfShards: Type.Number(),
    numberOfReplicas: Type.Number(),
  }),
  connection: Type.Object({
    retryAttempts: Type.Number(),
    retryDelay: Type.Number(),
    requestTimeout: Type.Number(),
  }),
});

export const VectorTilesConfigSchema = Type.Object({
  url: Type.String(),
  maxZoom: Type.Number(),
});

export const MapConfigSchema = Type.Object({
  defaultCenter: Type.Tuple([Type.Number(), Type.Number()]),
  defaultZoom: Type.Number(),
  minZoom: Type.Number(),
  maxZoom: Type.Number(),
});

export const BatchConfigSchema = Type.Object({
  size: Type.Number(),
  maxRetries: Type.Number(),
  retryDelay: Type.Number(),
});

export const ConfigSchema = Type.Object({
  client: ClientConfigSchema,
  elasticsearch: ElasticsearchConfigSchema,
  vectorTiles: VectorTilesConfigSchema,
  map: MapConfigSchema,
  batch: BatchConfigSchema,
});

export type ClientConfig = Static<typeof ClientConfigSchema>;
export type ElasticsearchConfig = Static<typeof ElasticsearchConfigSchema>;
export type VectorTilesConfig = Static<typeof VectorTilesConfigSchema>;
export type MapConfig = Static<typeof MapConfigSchema>;
export type BatchConfig = Static<typeof BatchConfigSchema>;
export type Config = Static<typeof ConfigSchema>;

export function buildConfig(): Config {
  return {
    client: defaultConfig,
    elasticsearch: {
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: {
        username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
        password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
      },
      index: process.env.ELASTICSEARCH_INDEX || 'places',
      settings: {
        numberOfShards: parseInt(process.env.ELASTICSEARCH_SHARDS || '1', 10),
        numberOfReplicas: parseInt(
          process.env.ELASTICSEARCH_REPLICAS || '0',
          10,
        ),
      },
      connection: {
        retryAttempts: parseInt(
          process.env.ELASTICSEARCH_RETRY_ATTEMPTS || '3',
          10,
        ),
        retryDelay: parseInt(
          process.env.ELASTICSEARCH_RETRY_DELAY || '2000',
          10,
        ),
        requestTimeout: parseInt(
          process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '30000',
          10,
        ),
      },
    },
    vectorTiles: buildVectorTilesConfig(),
    map: buildMapConfig(),
    batch: buildBatchConfig(),
  };
}

export function buildVectorTilesConfig(): VectorTilesConfig {
  return {
    url: process.env.VECTOR_TILES_URL || 'http://localhost:8080',
    maxZoom: 14,
  };
}

export function buildMapConfig(): MapConfig {
  return {
    defaultCenter: [0, 20],
    defaultZoom: 1.5,
    minZoom: 1,
    maxZoom: 18,
  };
}

export function buildBatchConfig(): BatchConfig {
  return {
    size: 100,
    maxRetries: 3,
    retryDelay: 1000,
  };
}
