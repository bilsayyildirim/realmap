"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchResponseSchema = SearchResponseSchema;
const typebox_1 = require("@sinclair/typebox");
const ServerReponse_1 = require("./ServerReponse");
// This function returns a TypeBox schema for a paginated search response
function SearchResponseSchema(itemSchema) {
    return typebox_1.Type.Union([
        ServerReponse_1.ServerResponseSchema,
        typebox_1.Type.Object({
            items: typebox_1.Type.Array(itemSchema),
            total: typebox_1.Type.Number(),
            page: typebox_1.Type.Number(),
            totalPages: typebox_1.Type.Number(),
        }),
    ]);
}
