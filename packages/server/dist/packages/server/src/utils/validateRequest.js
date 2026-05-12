"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = validateRequest;
const ajv_1 = __importDefault(require("ajv"));
const ajv = new ajv_1.default();
function validateRequest(options) {
    const validators = {
        body: options.body ? ajv.compile(options.body) : null,
        query: options.query ? ajv.compile(options.query) : null,
        params: options.params ? ajv.compile(options.params) : null,
    };
    return (req, res, next) => {
        const errors = {};
        // Validate each target if a schema is provided
        Object.keys(validators).forEach((target) => {
            const validator = validators[target];
            if (validator) {
                const data = req[target];
                if (!validator(data)) {
                    errors[target] = validator.errors;
                }
            }
        });
        // If any validation failed, return 400
        if (Object.keys(errors).length > 0) {
            return res
                .status(400)
                .json({ error: 'Validation failed', details: errors });
        }
        next();
    };
}
