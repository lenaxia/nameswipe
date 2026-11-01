import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import {
  createDataset,
  createMember,
  createRoom,
  createTestDb,
  type TestDb,
} from '../db/testing.js';
import { eq } from 'drizzle-orm';
import { CODE_ALPHABET, CODE_LENGTH, MAX_CODE_ATTEMPTS } from './codes.js';
import { createRoomsRouter, type RoomsRouterOptions } from './router.js';
import type { RoomConfig } from './config.js';

/**
 * Every test gets its own migrated temp SQLite file (createTestDb) and its
 * own app instance — no shared state between tests.
 */

let testDb: TestDb;

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.cleanup();
});

const codeRegex = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

function api(options: RoomsRouterOptions = {}) {
  return request(buildApp([createRoomsRouter(testDb.db, options)]));
}

function seedDataset(key = 'us-popular'): void {
  createDataset(testDb.db, { key });
}

function validConfig(datasetKey = 'us-popular'): RoomConfig {
  return {
    datasets: [datasetKey],
    genders: ['boy', 'girl'],
    tiers: ['popular', 'unranked'],
  };
}

interface ErrorDetail {
  path: string;
  message: string;
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: ErrorDetail[] };
}

function expectUnifiedError(body: unknown, code: string): ErrorEnvelope['error'] {
  expect(Object.keys(body as object)).toEqual(['error']);
  const { error } = body as ErrorEnvelope;
  expect(error.code).toBe(code);
  expect(error.message).toBeTypeOf('string');
  expect(error.message).not.toBe('');
  return error;
}

function expectIssues(body: unknown, path: string): void {
  const error = expectUnifiedError(body, 'validation_error');
  expect(error.details).toBeDefined();
  const paths = error.details!.map((detail) => detail.path);
  expect(paths).toContain(path);
}

describe('POST /api/rooms', () => {
  it('returns 201 with a 6-char code from the safe alphabet, persisted exactly in the DB', async () => {
    seedDataset('us-popular');
    const config: RoomConfig = {
      datasets: ['us-popular'],
      genders: ['boy', 'neutral'],
      tiers: ['rare'],
      origins: ['english'],
      firstLetters: ['a', 'b'],
    };

    const response = await api().post('/api/rooms').send(config);

    expect(response.status).toBe(201);
    const { code, room } = response.body as { code: string; room: unknown };
    expect(code).toMatch(codeRegex);
    expect((room as { code: string }).code).toBe(code);
    expect((room as { config: RoomConfig }).config).toEqual(config);

    const row = testDb.db.select().from(schema.rooms).where(eq(schema.rooms.code, code)).get();
    expect(row).toBeDefined();
    expect(row!.settings).toEqual({ config });
    expect(testDb.db.select().from(schema.rooms).all()).toHaveLength(1);
  });

  it('returns distinct codes for successive rooms with the default generator', async () => {
    seedDataset('us-popular');
    const first = await api().post('/api/rooms').send(validConfig());
    const second = await api().post('/api/rooms').send(validConfig());

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.code).toMatch(codeRegex);
    expect(second.body.code).toMatch(codeRegex);
    expect(first.body.code).not.toBe(second.body.code);
  });

  it('regenerates past a colliding code (deterministic source) and returns a fresh unique one', async () => {
    seedDataset('us-popular');
    createRoom(testDb.db, { code: 'AAAAAA' });
    const candidates = ['AAAAAA', 'BBBBBB'];
    const generateCode = () => candidates.shift() ?? 'CCCCCC';

    const response = await api({ generateCode }).post('/api/rooms').send(validConfig());

    expect(response.status).toBe(201);
    expect(response.body.code).toBe('BBBBBB');
    const row = testDb.db.select().from(schema.rooms).where(eq(schema.rooms.code, 'BBBBBB')).get();
    expect(row).toBeDefined();
    expect(row!.settings).toEqual({ config: validConfig() });
  });

  it('returns a 500-class error when every retry collides (exhaustion)', async () => {
    seedDataset('us-popular');
    createRoom(testDb.db, { code: 'AAAAAA' });
    const generateCode = () => 'AAAAAA';

    const response = await api({ generateCode }).post('/api/rooms').send(validConfig());

    expect(response.status).toBeGreaterThanOrEqual(500);
    const error = expectUnifiedError(response.body, 'room_code_exhausted');
    expect(error.message).toContain(String(MAX_CODE_ATTEMPTS));
    // No room beyond the pre-existing one was created.
    expect(testDb.db.select().from(schema.rooms).all()).toHaveLength(1);
  });

  it('renders 422 with field-level issues for an empty datasets array', async () => {
    seedDataset('us-popular');
    const response = await api()
      .post('/api/rooms')
      .send({ ...validConfig(), datasets: [] });

    expect(response.status).toBe(422);
    expectIssues(response.body, 'datasets');
  });

  it('renders 422 with field-level issues for an unknown dataset key', async () => {
    seedDataset('us-popular');
    const response = await api()
      .post('/api/rooms')
      .send({ ...validConfig(), datasets: ['us-popular', 'ghost-dataset'] });

    expect(response.status).toBe(422);
    const error = expectUnifiedError(response.body, 'validation_error');
    expect(error.details).toEqual([
      { path: 'datasets', message: "Unknown dataset: 'ghost-dataset'" },
    ]);
    expect(testDb.db.select().from(schema.rooms).all()).toHaveLength(0);
  });

  it('renders 422 with field-level issues for empty genders', async () => {
    seedDataset('us-popular');
    const response = await api()
      .post('/api/rooms')
      .send({ ...validConfig(), genders: [] });

    expect(response.status).toBe(422);
    expectIssues(response.body, 'genders');
  });

  it('renders 422 with field-level issues for a bad tier value', async () => {
    seedDataset('us-popular');
    const response = await api()
      .post('/api/rooms')
      .send({ ...validConfig(), tiers: ['famous'] });

    expect(response.status).toBe(422);
    expectIssues(response.body, 'tiers.0');
  });

  it('renders 422 with field-level issues for a firstLetters entry outside a-z', async () => {
    seedDataset('us-popular');
    const response = await api()
      .post('/api/rooms')
      .send({ ...validConfig(), firstLetters: ['a', '1'] });

    expect(response.status).toBe(422);
    expectIssues(response.body, 'firstLetters.1');
  });

  it('renders 422 with per-field issues when required fields are missing entirely', async () => {
    const response = await api().post('/api/rooms').send({});

    expect(response.status).toBe(422);
    expectIssues(response.body, 'datasets');
    expectIssues(response.body, 'genders');
    expectIssues(response.body, 'tiers');
  });
});

describe('GET /api/rooms/:code', () => {
  it('returns the room with memberCount and the exact stored config', async () => {
    seedDataset('us-popular');
    const config = validConfig();
    const createResponse = await api().post('/api/rooms').send(config);
    const { code, room } = createResponse.body as { code: string; room: { id: number } };
    createMember(testDb.db, { roomId: room.id, label: 'A', token: 'token-a' });
    createMember(testDb.db, { roomId: room.id, label: 'B', token: 'token-b' });

    const response = await api().get(`/api/rooms/${code}`);

    expect(response.status).toBe(200);
    expect(response.body.room.code).toBe(code);
    expect(response.body.room.config).toEqual(config);
    expect(response.body.room.createdAt).toBeTypeOf('string');
    expect(response.body.memberCount).toBe(2);
    expect(response.body.config).toEqual(config);
  });

  it('counts zero members for a fresh room', async () => {
    seedDataset('us-popular');
    const createResponse = await api().post('/api/rooms').send(validConfig());

    const response = await api().get(`/api/rooms/${createResponse.body.code}`);

    expect(response.status).toBe(200);
    expect(response.body.memberCount).toBe(0);
  });

  it('renders the 404 error contract for an unknown code', async () => {
    const response = await api().get('/api/rooms/ZZZZZ9');

    expect(response.status).toBe(404);
    const error = expectUnifiedError(response.body, 'room_not_found');
    expect(error.message).toContain('ZZZZZ9');
  });

  it('renders 400 validation_error for a code outside the pairing alphabet', async () => {
    const response = await api().get('/api/rooms/abc123');

    expect(response.status).toBe(400);
    expectIssues(response.body, 'code');
  });
});
