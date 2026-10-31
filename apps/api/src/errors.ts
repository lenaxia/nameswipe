import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';

export interface ValidationErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ValidationErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'type' in err && typeof err.type === 'string') {
    return err.type;
  }
  return undefined;
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err;
  }
  const type = bodyParserErrorType(err);
  if (type === 'entity.parse.failed') {
    return new ApiError(400, 'invalid_json', 'Request body is not valid JSON');
  }
  if (type === 'entity.too.large') {
    return new ApiError(413, 'payload_too_large', 'Request body exceeds the allowed size limit');
  }
  return new ApiError(500, 'internal_error', 'Internal server error');
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'not_found', `Unknown route: ${req.method} ${req.path}`));
}

interface ErrorPayload {
  code: string;
  message: string;
  details?: ValidationErrorDetail[];
  stack?: string;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const apiError = toApiError(err);
  const error: ErrorPayload = {
    code: apiError.code,
    message: apiError.message,
  };
  if (apiError.details) {
    error.details = apiError.details;
  }
  if (process.env.NODE_ENV === 'development' && err instanceof Error && err.stack) {
    error.stack = err.stack;
  }
  res.status(apiError.status).json({ error });
};
