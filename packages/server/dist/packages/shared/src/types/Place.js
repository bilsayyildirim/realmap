"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaceSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
const CookingMethods_1 = require("./CookingMethods");
const Ingredients_1 = require("./Ingredients");
exports.PlaceSchema = typebox_1.Type.Object({
    id: typebox_1.Type.String(),
    name: typebox_1.Type.String(),
    type: typebox_1.Type.Optional(typebox_1.Type.String()),
    countryCode: typebox_1.Type.Optional(typebox_1.Type.String()),
    region: typebox_1.Type.Optional(typebox_1.Type.String()),
    latitude: typebox_1.Type.Optional(typebox_1.Type.Number()),
    longitude: typebox_1.Type.Optional(typebox_1.Type.Number()),
    population: typebox_1.Type.Optional(typebox_1.Type.Number()),
    timeZone: typebox_1.Type.Optional(typebox_1.Type.String()),
    continent: typebox_1.Type.Optional(typebox_1.Type.String()),
    ingredients: typebox_1.Type.Optional(Ingredients_1.IngredientsSchema),
    cookingMethods: typebox_1.Type.Optional(CookingMethods_1.CookingMethodsSchema),
    clusters: typebox_1.Type.Optional(typebox_1.Type.Object({
        all: typebox_1.Type.Number(),
        ingredients: typebox_1.Type.Number(),
        cookingMethods: typebox_1.Type.Number(),
        allValue: typebox_1.Type.Optional(typebox_1.Type.Number()),
        color: typebox_1.Type.Optional(typebox_1.Type.String()),
    })),
    clusterId: typebox_1.Type.Optional(typebox_1.Type.Number()),
    color: typebox_1.Type.Optional(typebox_1.Type.String()),
    embedding: typebox_1.Type.Optional(typebox_1.Type.Array(typebox_1.Type.Number())),
    // Allow additional properties for flexibility
    // (e.g. description, address, etc.)
});
