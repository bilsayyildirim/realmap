"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildConfig = void 0;
const buildConfig = () => {
    return {
        port: parseInt(process.env.PORT || '3001', 10),
        elasticsearch: {
            node: process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200',
            auth: {
                username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
                password: process.env.ELASTICSEARCH_PASSWORD || 'changeme',
            },
        },
    };
};
exports.buildConfig = buildConfig;
