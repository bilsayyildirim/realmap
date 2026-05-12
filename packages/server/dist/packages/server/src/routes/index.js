"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRouter = void 0;
const express_1 = require("express");
const clusters_1 = require("./clusters");
const buildRouter = (client) => {
    const router = (0, express_1.Router)();
    router.use('/clusters', (0, clusters_1.buildClustersRouter)(client));
    return router;
};
exports.buildRouter = buildRouter;
