import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import { createDataset, createTestDb, type TestDb } from '../db/testing.js';
import { eq } from 'drizzle-orm';
import { createRoomsRouter } from './router.js';
import { DEFAULT_NICKNAME, MAX_MEMBERS } from './members.js';
import type { RoomConfig } from './config.js';

/**
 * Join + member listing integration tests. Every test gets its own migrated
 * temp SQLite file (createTestDb) and its own app instance, and creates its
 * room through the public API so the full create->join flow is exercised.
 */

let testDb: TestDb;

beforeEach(() => {
  testDb = createTestDb();
  createDataset(testDb.db, { key: 'us-popular' });
});

afterEach(() => {
  testDb.cleanup();
});

function api() {
  return request(buildApp([createRoomsRouter(testDb.db)]));
}

async function createRoom(): Promise<string> {
  const config: RoomConfig = {
    datasets: ['us-popular'],
    genders: ['boy', 'girl'],
    tiers: ['popular', 'unranked'],
  };
  const response = await api().post('/api/rooms').send(config);
  expect(response.status).toBe(201);
  return response.body.code as string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface JoinResponse {
  memberId: string;
  nickname: string;
  joinedAt: string;
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

async function join(code: string, body?: { nickname?: string }) {
  return api()
    .post(`/api/rooms/${code}/join`)
    .send(body ?? {});
}

describe('POST /api/rooms/:code/join', () => {
  it('admits the first member solo: 201, uuid memberId, default nickname, ISO joinedAt, row persisted', async () => {
    const code = await createRoom();

    const response = await join(code, {});

    expect(response.status).toBe(201);
    const member = response.body as JoinResponse;
    expect(member.memberId).toMatch(UUID_PATTERN);
    expect(member.nickname).toBe(DEFAULT_NICKNAME);
    expect(member.joinedAt).toBeTypeOf('string');
    expect(Number.isNaN(Date.parse(member.joinedAt))).toBe(false);

    const row = testDb.db
      .select()
      .from(schema.members)
      .where(eq(schema.members.token, member.memberId))
      .get();
    expect(row).toBeDefined();
    expect(row!.label).toBe(DEFAULT_NICKNAME);
    expect(row!.roomId).toBe(
      testDb.db.select().from(schema.rooms).where(eq(schema.rooms.code, code)).get()!.id,
    );
    expect(testDb.db.select().from(schema.members).all()).toHaveLength(1);
  });

  it('keeps the default when no body is sent at all', async () => {
    const code = await createRoom();

    const response = await api().post(`/api/rooms/${code}/join`);

    expect(response.status).toBe(201);
    expect(response.body.nickname).toBe(DEFAULT_NICKNAME);
  });

  it('trims an explicit nickname before storing it', async () => {
    const code = await createRoom();

    const response = await join(code, { nickname: '  Ada  ' });

    expect(response.status).toBe(201);
    expect(response.body.nickname).toBe('Ada');
  });

  it('accepts the second member with a distinct memberId', async () => {
    const code = await createRoom();
    const first = await join(code, { nickname: 'Ada' });
    expect(first.status).toBe(201);

    const second = await join(code, { nickname: 'Belle' });

    expect(second.status).toBe(201);
    expect(second.body.memberId).toMatch(UUID_PATTERN);
    expect(second.body.memberId).not.toBe(first.body.memberId);
    expect(testDb.db.select().from(schema.members).all()).toHaveLength(2);
  });

  it('rejects the third member with 409 room_full and leaves membership unchanged', async () => {
    const code = await createRoom();
    await join(code, { nickname: 'Ada' });
    await join(code, { nickname: 'Belle' });

    const response = await join(code, { nickname: 'Cara' });

    expect(response.status).toBe(409);
    const error = expectUnifiedError(response.body, 'room_full');
    expect(error.message).toContain(code);
    expect(testDb.db.select().from(schema.members).all()).toHaveLength(MAX_MEMBERS);

    const members = await api().get(`/api/rooms/${code}/members`);
    expect(members.status).toBe(200);
    expect(members.body).toHaveLength(MAX_MEMBERS);
  });

  it('renders 422 for a nickname over 24 characters', async () => {
    const code = await createRoom();

    const response = await join(code, { nickname: 'a'.repeat(25) });

    expect(response.status).toBe(422);
    expectIssues(response.body, 'nickname');
    expect(testDb.db.select().from(schema.members).all()).toHaveLength(0);
  });

  it('renders 422 for a nickname that is empty after trimming', async () => {
    const code = await createRoom();

    const response = await join(code, { nickname: '    ' });

    expect(response.status).toBe(422);
    expectIssues(response.body, 'nickname');
    expect(testDb.db.select().from(schema.members).all()).toHaveLength(0);
  });

  it('accepts exactly 24 characters after trimming (boundary)', async () => {
    const code = await createRoom();
    const nickname = `  ${'a'.repeat(24)}  `;

    const response = await join(code, { nickname });

    expect(response.status).toBe(201);
    expect(response.body.nickname).toBe('a'.repeat(24));
  });

  it('renders 404 room_not_found for an unknown code', async () => {
    const response = await join('ZZZZZ9', { nickname: 'Ada' });

    expect(response.status).toBe(404);
    const error = expectUnifiedError(response.body, 'room_not_found');
    expect(error.message).toContain('ZZZZZ9');
  });

  it('renders 400 validation_error for a code outside the pairing alphabet', async () => {
    const response = await api().post('/api/rooms/abc123/join').send({});

    expect(response.status).toBe(400);
    expectIssues(response.body, 'code');
  });
});

describe('GET /api/rooms/:code/members', () => {
  it('returns both members ordered by joinedAt', async () => {
    const code = await createRoom();
    const first = await join(code, { nickname: 'Ada' });
    const second = await join(code, { nickname: 'Belle' });

    const response = await api().get(`/api/rooms/${code}/members`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const members = response.body as JoinResponse[];
    expect(members).toHaveLength(2);
    expect(members.map((member) => member.nickname)).toEqual(['Ada', 'Belle']);
    expect(members[0].memberId).toBe(first.body.memberId);
    expect(members[1].memberId).toBe(second.body.memberId);
    for (const member of members) {
      expect(member.memberId).toMatch(UUID_PATTERN);
      expect(Number.isNaN(Date.parse(member.joinedAt))).toBe(false);
    }
    expect(Date.parse(members[0].joinedAt)).toBeLessThanOrEqual(Date.parse(members[1].joinedAt));
  });

  it('returns exactly one member for a solo room', async () => {
    const code = await createRoom();
    await join(code, { nickname: 'Ada' });

    const response = await api().get(`/api/rooms/${code}/members`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].nickname).toBe('Ada');
  });

  it('returns an empty array for a fresh room', async () => {
    const code = await createRoom();

    const response = await api().get(`/api/rooms/${code}/members`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('renders 404 room_not_found for an unknown code', async () => {
    const response = await api().get('/api/rooms/ZZZZZ9/members');

    expect(response.status).toBe(404);
    expectUnifiedError(response.body, 'room_not_found');
  });

  it('renders 400 validation_error for a code outside the pairing alphabet', async () => {
    const response = await api().get('/api/rooms/abc123/members');

    expect(response.status).toBe(400);
    expectIssues(response.body, 'code');
  });
});

describe('join reflected in GET /api/rooms/:code', () => {
  it('memberCount tracks joins: 0 -> 1 -> 2, unchanged by a rejected third', async () => {
    const code = await createRoom();

    expect((await api().get(`/api/rooms/${code}`)).body.memberCount).toBe(0);

    await join(code, { nickname: 'Ada' });
    expect((await api().get(`/api/rooms/${code}`)).body.memberCount).toBe(1);

    await join(code, { nickname: 'Belle' });
    expect((await api().get(`/api/rooms/${code}`)).body.memberCount).toBe(2);

    await join(code, { nickname: 'Cara' });
    expect((await api().get(`/api/rooms/${code}`)).body.memberCount).toBe(2);
  });
});
