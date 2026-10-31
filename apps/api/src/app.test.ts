import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('GET /api/ping', () => {
  it('returns the stub payload', async () => {
    const response = await request(createApp()).get('/api/ping');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ pong: true });
  });
});
