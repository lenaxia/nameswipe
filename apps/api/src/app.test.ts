import { Router } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import { validate } from './validate.js';

const echoSchema = z.object({ message: z.string().min(1) });
const searchSchema = z.object({ q: z.string().min(1) });
const idParamsSchema = z.object({ id: z.string().regex(/^\d+$/) });

const testRouter = Router();
testRouter.post('/api/echo', validate({ body: echoSchema }), (req, res) => {
  res.json({ message: req.body.message });
});
testRouter.get('/api/search', validate({ query: searchSchema }), (req, res) => {
  res.json({ q: req.query.q });
});
testRouter.get('/api/items/:id', validate({ params: idParamsSchema }), (req, res) => {
  res.json({ id: req.params.id });
});
testRouter.get('/api/boom', () => {
  throw new Error('unexpected failure');
});

function api() {
  return request(buildApp([testRouter]));
}

interface ErrorDetail {
  path: string;
  message: string;
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: ErrorDetail[]; stack?: string };
}

function expectUnifiedError(body: unknown, code: string): ErrorEnvelope['error'] {
  expect(Object.keys(body as object)).toEqual(['error']);
  const { error } = body as ErrorEnvelope;
  expect(error.code).toBe(code);
  expect(error.message).toBeTypeOf('string');
  expect(error.message).not.toBe('');
  return error;
}

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe('GET /api/health', () => {
  it('returns 200 with the health payload shape', async () => {
    const response = await api().get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('renders the 404 error contract', async () => {
    const response = await api().get('/api/does-not-exist');

    expect(response.status).toBe(404);
    const error = expectUnifiedError(response.body, 'not_found');
    expect(Object.keys(error).sort()).toEqual(['code', 'message']);
    expect(error.message).toContain('/api/does-not-exist');
  });
});

describe('malformed JSON bodies', () => {
  it('renders the 400 invalid_json contract', async () => {
    const response = await api()
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{"message":');

    expect(response.status).toBe(400);
    const error = expectUnifiedError(response.body, 'invalid_json');
    expect(Object.keys(error).sort()).toEqual(['code', 'message']);
  });
});

describe('body validation', () => {
  it('passes a valid body through and echoes it back', async () => {
    const response = await api().post('/api/echo').send({ message: 'hello nameswipe' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'hello nameswipe' });
  });

  it('renders 400 validation_error with issue details for a wrong-typed field', async () => {
    const response = await api().post('/api/echo').send({ message: 42 });

    expect(response.status).toBe(400);
    const error = expectUnifiedError(response.body, 'validation_error');
    expect(Object.keys(error).sort()).toEqual(['code', 'details', 'message']);
    expect(error.details).toHaveLength(1);
    expect(error.details![0]!.path).toBe('message');
    expect(error.details![0]!.message).toBeTypeOf('string');
    expect(error.details![0]!.message).not.toBe('');
  });

  it('renders 400 validation_error with issue details for a missing field', async () => {
    const response = await api().post('/api/echo').send({});

    expect(response.status).toBe(400);
    const error = expectUnifiedError(response.body, 'validation_error');
    expect(error.details![0]!.path).toBe('message');
  });
});

describe('query validation', () => {
  it('passes a valid query through', async () => {
    const response = await api().get('/api/search?q=baby+names');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ q: 'baby names' });
  });

  it('renders 400 validation_error with details for a missing query param', async () => {
    const response = await api().get('/api/search');

    expect(response.status).toBe(400);
    const error = expectUnifiedError(response.body, 'validation_error');
    expect(error.details![0]!.path).toBe('q');
  });
});

describe('params validation', () => {
  it('passes valid params through', async () => {
    const response = await api().get('/api/items/17');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: '17' });
  });

  it('renders 400 validation_error with details for a non-numeric param', async () => {
    const response = await api().get('/api/items/abc');

    expect(response.status).toBe(400);
    const error = expectUnifiedError(response.body, 'validation_error');
    expect(error.details![0]!.path).toBe('id');
  });
});

describe('unhandled errors', () => {
  it('renders the 500 internal_error contract without leaking the cause', async () => {
    const response = await api().get('/api/boom');

    expect(response.status).toBe(500);
    const error = expectUnifiedError(response.body, 'internal_error');
    expect(error.message).toBe('Internal server error');
    expect(Object.keys(error).sort()).toEqual(['code', 'message']);
    expect(JSON.stringify(response.body)).not.toContain('unexpected failure');
  });
});

describe('stack traces in responses', () => {
  it('never includes a stack in production, on a 500 path', async () => {
    process.env.NODE_ENV = 'production';
    const response = await api().get('/api/boom');

    expect(response.status).toBe(500);
    expect(Object.keys((response.body as ErrorEnvelope).error).sort()).toEqual(['code', 'message']);
    expect(JSON.stringify(response.body)).not.toContain('unexpected failure');
  });

  it('never includes a stack in production, on a 400 validation path', async () => {
    process.env.NODE_ENV = 'production';
    const response = await api().post('/api/echo').send({ message: 42 });

    expect(response.status).toBe(400);
    expect(Object.keys((response.body as ErrorEnvelope).error).sort()).toEqual([
      'code',
      'details',
      'message',
    ]);
    expect(JSON.stringify(response.body)).not.toContain('at ');
  });

  it('includes a stack in development on a 500 path', async () => {
    process.env.NODE_ENV = 'development';
    const response = await api().get('/api/boom');

    expect(response.status).toBe(500);
    const error = (response.body as ErrorEnvelope).error;
    expect(error.stack).toBeTypeOf('string');
    expect(error.stack).toContain('unexpected failure');
  });
});

describe('CORS', () => {
  it('allows the Vite dev origin', async () => {
    const response = await api().get('/api/health').set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('answers the preflight for the Vite dev origin', async () => {
    const response = await api()
      .options('/api/echo')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow other origins', async () => {
    const response = await api().get('/api/health').set('Origin', 'http://evil.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('JSON body size limit', () => {
  it('renders 413 payload_too_large for oversized bodies', async () => {
    const response = await api()
      .post('/api/echo')
      .send({ message: 'x'.repeat(110 * 1024) });

    expect(response.status).toBe(413);
    const error = expectUnifiedError(response.body, 'payload_too_large');
    expect(Object.keys(error).sort()).toEqual(['code', 'message']);
  });
});
