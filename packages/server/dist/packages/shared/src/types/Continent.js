"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContinentSchema = void 0;
const typebox_1 = require("@sinclair/typebox");
exports.ContinentSchema = typebox_1.Type.Enum({
    Africa: 'Africa',
    Antarctica: 'Antarctica',
    Asia: 'Asia',
    Europe: 'Europe',
    NorthAmerica: 'North America',
    Oceania: 'Oceania',
    SouthAmerica: 'South America',
});
