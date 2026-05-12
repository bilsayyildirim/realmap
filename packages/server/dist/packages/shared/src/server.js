"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElasticsearchClient = exports.buildIndices = exports.buildElasticsearchClient = void 0;
const elasticsearch_1 = require("@elastic/elasticsearch");
Object.defineProperty(exports, "ElasticsearchClient", { enumerable: true, get: function () { return elasticsearch_1.Client; } });
// Server-specific clients and utilities
var elasticsearch_2 = require("./clients/elasticsearch");
Object.defineProperty(exports, "buildElasticsearchClient", { enumerable: true, get: function () { return elasticsearch_2.buildElasticsearchClient; } });
Object.defineProperty(exports, "buildIndices", { enumerable: true, get: function () { return elasticsearch_2.buildIndices; } });
// Types
__exportStar(require("./types"), exports);
// Config
__exportStar(require("./config/server"), exports);
