"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIndices = buildIndices;
const types_1 = require("../../types");
const clusters_1 = require("./mappings/clusters");
const mappings = {
    [types_1.IndexName.CLUSTERS]: clusters_1.clustersMapping,
};
async function buildIndices(client) {
    for (const [indexName, mapping] of Object.entries(mappings)) {
        const indexExists = await client.indices.exists({ index: indexName });
        if (indexExists) {
            console.log(`Index ${indexName} already exists`);
        }
        else {
            console.log(`Creating index ${indexName}`);
            await client.indices.create(mapping);
        }
    }
}
