"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = exports.BatchConfigSchema = exports.MapConfigSchema = exports.VectorTilesConfigSchema = exports.ElasticsearchConfigSchema = void 0;
exports.buildConfig = buildConfig;
exports.buildVectorTilesConfig = buildVectorTilesConfig;
exports.buildMapConfig = buildMapConfig;
exports.buildBatchConfig = buildBatchConfig;
const typebox_1 = require("@sinclair/typebox");
const client_1 = require("./client");
exports.ElasticsearchConfigSchema = typebox_1.Type.Object({
    node: typebox_1.Type.String(),
    auth: typebox_1.Type.Object({
        username: typebox_1.Type.String(),
        password: typebox_1.Type.String(),
    }),
    index: typebox_1.Type.String(),
    settings: typebox_1.Type.Object({
        numberOfShards: typebox_1.Type.Number(),
        numberOfReplicas: typebox_1.Type.Number(),
    }),
    connection: typebox_1.Type.Object({
        retryAttempts: typebox_1.Type.Number(),
        retryDelay: typebox_1.Type.Number(),
        requestTimeout: typebox_1.Type.Number(),
    }),
});
exports.VectorTilesConfigSchema = typebox_1.Type.Object({
    url: typebox_1.Type.String(),
    maxZoom: typebox_1.Type.Number(),
});
exports.MapConfigSchema = typebox_1.Type.Object({
    defaultCenter: typebox_1.Type.Tuple([typebox_1.Type.Number(), typebox_1.Type.Number()]),
    defaultZoom: typebox_1.Type.Number(),
    minZoom: typebox_1.Type.Number(),
    maxZoom: typebox_1.Type.Number(),
});
exports.BatchConfigSchema = typebox_1.Type.Object({
    size: typebox_1.Type.Number(),
    maxRetries: typebox_1.Type.Number(),
    retryDelay: typebox_1.Type.Number(),
});
exports.ConfigSchema = typebox_1.Type.Object({
    client: client_1.ClientConfigSchema,
    elasticsearch: exports.ElasticsearchConfigSchema,
    vectorTiles: exports.VectorTilesConfigSchema,
    map: exports.MapConfigSchema,
    batch: exports.BatchConfigSchema,
});
function buildConfig() {
    return {
        client: client_1.defaultConfig,
        elasticsearch: {
            node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
            auth: {
                username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
                password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
            },
            index: process.env.ELASTICSEARCH_INDEX || 'places',
            settings: {
                numberOfShards: parseInt(process.env.ELASTICSEARCH_SHARDS || '1', 10),
                numberOfReplicas: parseInt(process.env.ELASTICSEARCH_REPLICAS || '0', 10),
            },
            connection: {
                retryAttempts: parseInt(process.env.ELASTICSEARCH_RETRY_ATTEMPTS || '3', 10),
                retryDelay: parseInt(process.env.ELASTICSEARCH_RETRY_DELAY || '2000', 10),
                requestTimeout: parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '30000', 10),
            },
        },
        vectorTiles: buildVectorTilesConfig(),
        map: buildMapConfig(),
        batch: buildBatchConfig(),
    };
}
function buildVectorTilesConfig() {
    return {
        url: process.env.VECTOR_TILES_URL || 'http://localhost:8080',
        maxZoom: 14,
    };
}
function buildMapConfig() {
    return {
        defaultCenter: [0, 20],
        defaultZoom: 1.5,
        minZoom: 1,
        maxZoom: 18,
    };
}
function buildBatchConfig() {
    return {
        size: 100,
        maxRetries: 3,
        retryDelay: 1000,
    };
}
