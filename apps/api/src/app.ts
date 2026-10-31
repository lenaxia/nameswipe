import express, { type Express, type RequestHandler, type Router } from 'express';
import cors from 'cors';
import { errorHandler, notFound } from './errors.js';

const CORS_ORIGIN_DEFAULT = 'http://localhost:5173';
const JSON_BODY_LIMIT = '100kb';

function requestLogger(): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test') {
        return;
      }
      const ms = (performance.now() - start).toFixed(1);
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });
    next();
  };
}

export function buildApp(routers: Router[] = []): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: [process.env.CORS_ORIGIN ?? CORS_ORIGIN_DEFAULT] }));
  app.use(requestLogger());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  for (const router of routers) {
    app.use(router);
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
