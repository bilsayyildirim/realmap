import { Static, TSchema } from '@sinclair/typebox';
import Ajv, { ValidateFunction } from 'ajv';
import { NextFunction, Request, RequestHandler, Response } from 'express';

const ajv = new Ajv();

type ValidateTarget = 'body' | 'query' | 'params';

interface ValidationOptions {
  body?: TSchema;
  query?: TSchema;
  params?: TSchema;
}

export function validateRequest(options: ValidationOptions): RequestHandler {
  const validators: Record<ValidateTarget, ValidateFunction | null> = {
    body: options.body ? ajv.compile(options.body) : null,
    query: options.query ? ajv.compile(options.query) : null,
    params: options.params ? ajv.compile(options.params) : null,
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, any> = {};

    // Validate each target if a schema is provided
    (Object.keys(validators) as ValidateTarget[]).forEach((target) => {
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

// Type helper for validated request data
export type ValidatedRequest<T extends ValidationOptions> = {
  [K in keyof T as K extends ValidateTarget ? K : never]: T[K] extends TSchema
    ? Static<T[K]>
    : never;
};
