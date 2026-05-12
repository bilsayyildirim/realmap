"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productionConfig = exports.defaultConfig = exports.ClientConfigSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
exports.ClientConfigSchema = typebox_1.Type.Object({
    NODE_ENV: typebox_1.Type.Union([
        typebox_1.Type.Literal('development'),
        typebox_1.Type.Literal('production'),
        typebox_1.Type.Literal('test'),
    ]),
    API_URL: typebox_1.Type.String(),
    MAP_STYLE_URL: typebox_1.Type.String(),
    MAP_DEFAULT_CENTER: typebox_1.Type.Tuple([typebox_1.Type.Number(), typebox_1.Type.Number()]),
    MAP_DEFAULT_ZOOM: typebox_1.Type.Number(),
});
// Default values for client config (development)
exports.defaultConfig = {
    NODE_ENV: 'development',
    API_URL: 'http://server:3001', // Use Docker service name
    MAP_STYLE_URL: 'https://demotiles.maplibre.org/style.json',
    MAP_DEFAULT_CENTER: [0, 20],
    MAP_DEFAULT_ZOOM: 1.5,
};
// Production config
exports.productionConfig = {
    NODE_ENV: 'production',
    API_URL: 'https://api.realmap.com',
    MAP_STYLE_URL: 'https://tiles.realmap.com/style.json',
    MAP_DEFAULT_CENTER: [0, 20],
    MAP_DEFAULT_ZOOM: 1.5,
};
