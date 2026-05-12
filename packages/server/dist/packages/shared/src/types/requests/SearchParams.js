"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchParamsSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
exports.SearchParamsSchema = typebox_1.Type.Object({
    query: typebox_1.Type.Optional(typebox_1.Type.String()),
    limit: typebox_1.Type.Optional(typebox_1.Type.Number()),
    offset: typebox_1.Type.Optional(typebox_1.Type.Number()),
    includes: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
    sort: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.String())),
});
