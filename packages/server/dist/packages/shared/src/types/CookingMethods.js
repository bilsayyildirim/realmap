"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookingMethodsSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
exports.CookingMethodsSchema = typebox_1.Type.Object({
    "braising": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "drying": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "fermenting": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "marinating": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "pickling": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "preserving": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "rice_cooking": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "slow_cooking": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "smoking": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "steaming": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "stir_frying": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "stuffing": typebox_1.Type.Optional(typebox_1.Type.Number()),
    "tempering": typebox_1.Type.Optional(typebox_1.Type.Number()),
});
