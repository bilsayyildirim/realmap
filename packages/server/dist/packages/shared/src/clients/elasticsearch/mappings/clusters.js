"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clustersMapping = void 0;
const types_1 = require("../../../types");
exports.clustersMapping = {
    index: types_1.IndexName.CLUSTERS,
    body: {
        settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
                analyzer: {
                    default: {
                        type: 'standard',
                    },
                    autocomplete: {
                        type: 'custom',
                        tokenizer: 'standard',
                        filter: ['lowercase', 'autocomplete_filter'],
                    },
                },
                filter: {
                    autocomplete_filter: {
                        type: 'edge_ngram',
                        min_gram: 1,
                        max_gram: 20,
                    },
                },
            },
        },
        mappings: {
            dynamic: false,
            properties: {
                id: {
                    type: 'keyword',
                },
                cookingMethods: {
                    type: 'object',
                    enabled: true,
                },
                ingredients: {
                    type: 'object',
                    enabled: true,
                },
                clusters: {
                    type: 'object',
                    enabled: true,
                },
                createdAt: { type: 'date' },
                updatedAt: { type: 'date' },
            },
        },
    },
};
