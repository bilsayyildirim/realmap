"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClustersSchema = exports.ClusterInfoSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
const CookingMethods_1 = require("./CookingMethods");
const Ingredients_1 = require("./Ingredients");
exports.ClusterInfoSchema = typebox_1.Type.Object({
    ingredients: typebox_1.Type.String(),
    cookingMethods: typebox_1.Type.String(),
    all: typebox_1.Type.String(),
});
exports.ClustersSchema = typebox_1.Type.Object({
    id: typebox_1.Type.String(),
    cookingMethods: CookingMethods_1.CookingMethodsSchema,
    ingredients: Ingredients_1.IngredientsSchema,
    clusters: typebox_1.Type.Optional(exports.ClusterInfoSchema),
    createdAt: typebox_1.Type.String(),
    updatedAt: typebox_1.Type.String(),
});
