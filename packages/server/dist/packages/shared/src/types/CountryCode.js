"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countriesByCodeMap = exports.CountryCodeSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
const countries_list_1 = require("countries-list");
// Get all valid country codes from the library
const countryCodes = Object.keys(countries_list_1.countries);
// Create a TypeBox enum from all country codes
exports.CountryCodeSchema = typebox_1.Type.Union(countryCodes.map((code) => typebox_1.Type.Literal(code)));
// Helper map for looking up country details
exports.countriesByCodeMap = countryCodes.reduce((acc, code) => {
    acc[code] = countries_list_1.countries[code];
    return acc;
}, {});
