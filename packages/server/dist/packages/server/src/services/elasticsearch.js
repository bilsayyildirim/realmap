"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildElasticsearchClient = void 0;
const elasticsearch_1 = require("@elastic/elasticsearch");
const buildElasticsearchClient = async (config) => {
    const client = new elasticsearch_1.Client({
        node: config.node,
        auth: {
            username: config.auth.username,
            password: config.auth.password,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });
    try {
        // Test the connection
        await client.ping();
        console.log('Successfully connected to Elasticsearch');
        return client;
    }
    catch (error) {
        console.error('Failed to connect to Elasticsearch:', error);
        throw error;
    }
};
exports.buildElasticsearchClient = buildElasticsearchClient;
