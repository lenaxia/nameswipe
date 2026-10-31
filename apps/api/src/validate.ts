import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from './errors.js';

interface ValidationSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    for (const target of ['params', 'query', 'body'] as const) {
      const schema = schemas[target];
      if (!schema) {
        continue;
      }
      const parsed = schema.safeParse(req[target]);
      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        }));
        next(new ApiError(400, 'validation_error', `Invalid request ${target}`, details));
        return;
      }
      if (target === 'body') {
        req.body = parsed.data;
      } else if (target === 'query') {
        Object.defineProperty(req, 'query', { value: parsed.data });
      } else {
        req.params = parsed.data as typeof req.params;
      }
    }
    next();
  };
}
