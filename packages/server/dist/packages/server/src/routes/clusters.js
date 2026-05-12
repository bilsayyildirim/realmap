"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClustersRouter = void 0;
const shared_1 = require("@realmap/shared");
const express_1 = require("express");
const handlers_1 = require("../services/clusters/handlers");
const validateRequest_1 = require("../utils/validateRequest");
const buildClustersRouter = (client) => {
    const router = (0, express_1.Router)();
    const handlers = (0, handlers_1.buildClustersHandlers)(client);
    // Search places
    router.get('/', (0, validateRequest_1.validateRequest)({
        query: shared_1.SearchParamsSchema,
    }), async (req, res) => {
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
        }
        catch (error) {
            console.error('Error searching clusters:', error);
            res.status(500).json({ error: 'Failed to search clusters' });
        }
    });
    // Get place by ID
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const cluster = await handlers.getClustersById(id);
            if (!cluster)
                return res.status(404).json({ error: 'Not found' });
            res.json(cluster);
        }
        catch (error) {
            console.error('Error fetching place by ID:', error);
            res.status(500).json({ error: 'Failed to fetch place' });
        }
    });
    return router;
};
exports.buildClustersRouter = buildClustersRouter;
