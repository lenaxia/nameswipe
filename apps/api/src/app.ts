import express from 'express';

export function createApp() {
  const app = express();

  app.get('/api/ping', (_req, res) => {
    res.json({ pong: true });
  });

  return app;
}
