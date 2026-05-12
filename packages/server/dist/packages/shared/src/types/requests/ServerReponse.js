"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerResponseSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
exports.ServerResponseSchema = typebox_1.Type.Object({
    error: typebox_1.Type.Optional(typebox_1.Type.String()),
});
