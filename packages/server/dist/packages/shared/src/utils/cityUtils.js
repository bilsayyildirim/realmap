"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCityId = void 0;
const getCityId = (city) => {
    return `${city.name}-${city.stateCode}-${city.countryCode}`;
};
exports.getCityId = getCityId;
