"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClustersHandlers = void 0;
const shared_1 = require("@realmap/shared");
const ClustersResponseSchema = (0, shared_1.SearchResponseSchema)(shared_1.ClustersSchema);
const buildClustersHandlerInternal = (client) => {
    return {
        async searchClusters(params) {
            const { query, limit = 10, offset = 0, includes } = params;
            const must = [];
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
            const { hits } = await client.search({
                index: shared_1.IndexName.CLUSTERS,
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
            const total = typeof hits.total === 'object' ? hits.total.value : hits.total || 0;
            return {
                items: hits.hits.map((hit) => hit._source),
                total,
                page: Math.floor(offset / limit) + 1,
                totalPages: Math.ceil(total / limit),
            };
        },
        async getClustersById(id) {
            try {
                const { _source: clusters } = await client.get({
                    index: shared_1.IndexName.CLUSTERS,
                    id,
                });
                return clusters;
            }
            catch (error) {
                if (error.meta && error.meta.statusCode === 404) {
                    return null;
                }
                throw error;
            }
        },
    };
};
const buildClustersHandlers = (client) => {
    return buildClustersHandlerInternal(client);
};
exports.buildClustersHandlers = buildClustersHandlers;
