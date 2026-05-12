"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const routes_1 = require("./routes");
const elasticsearch_1 = require("./services/elasticsearch");
const start = async () => {
    const app = (0, express_1.default)();
    const config = (0, config_1.buildConfig)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    // Add health check endpoint before any async/await
    app.get('/health', (_, res) => {
        res.status(200).json({ status: 'ok' });
    });
    const client = await (0, elasticsearch_1.buildElasticsearchClient)(config.elasticsearch);
    const router = (0, routes_1.buildRouter)(client);
    app.use('/api', router);
    // Listen on 0.0.0.0 for Docker compatibility
    app.listen(config.port, '0.0.0.0', () => {
        console.log(`Server is running on port ${config.port}`);
    });
};
start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
