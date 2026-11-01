import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import { createTestDb, type TestDb } from '../db/testing.js';
import type { ParsedDataset } from '../data/contract.js';
import { mergeDatasets } from '../data/merge.js';
import { seedDatabase } from '../data/seed.js';
import { entry, fixtureDataset } from '../data/testkit.js';
import type { RoomConfig } from './config.js';
import { createRoomsRouter } from './router.js';
import { findDerivedMatches } from './swipes.js';

/**
 * Swipes endpoint integration tests.
 *
 * Every test gets its own migrated temp SQLite file and its own app
 * instance — no shared state between tests. Two fixture datasets isolate the
 * room-dataset rule: 'alpha' names are swipable in rooms configured with
 * alpha, 'beta' names are not.
 */

let testDb: TestDb;

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.cleanup();
});

function api() {
  return request(buildApp([createRoomsRouter(testDb.db)]));
}

const ALPHA_ENTRIES = [entry('Aria', { gender: 'girl' }), entry('Bruno', { gender: 'boy' })];
const BETA_ENTRIES = [entry('Dov', { gender: 'boy' })];

function seedFixtures(datasets: ParsedDataset[]): void {
  const { names } = mergeDatasets(datasets);
  seedDatabase(testDb.db, datasets, names);
}

function seedStandardFixtures(): void {
  seedFixtures([
    fixtureDataset('alpha', 10, ALPHA_ENTRIES),
    fixtureDataset('beta', 20, BETA_ENTRIES),
  ]);
}

function alphaConfig(): RoomConfig {
  return { datasets: ['alpha'], genders: ['boy', 'girl'], tiers: ['unranked'] };
}

interface RoomHandles {
  code: string;
  room: schema.Room;
  memberIds: string[];
}

/** Creates a room through the public API and joins `members` named members. */
async function openRoom(config: RoomConfig, nicknames: string[]): Promise<RoomHandles> {
  const created = await api().post('/api/rooms').send(config);
  expect(created.status, `room creation failed: ${JSON.stringify(created.body)}`).toBe(201);
  const code = created.body.code as string;
  const room = testDb.db.select().from(schema.rooms).where(eq(schema.rooms.code, code)).get()!;
  const memberIds: string[] = [];
  for (const nickname of nicknames) {
    const joined = await api().post(`/api/rooms/${code}/join`).send({ nickname });
    expect(joined.status, `join failed: ${JSON.stringify(joined.body)}`).toBe(201);
    memberIds.push(joined.body.memberId as string);
  }
  return { code, room, memberIds };
}

function nameIdByDisplay(display: string): number {
  const name = testDb.db.select().from(schema.names).where(eq(schema.names.display, display)).get();
  expect(name, `fixture name '${display}' should be seeded`).toBeDefined();
  return name!.id;
}

function swipe(code: string, memberId: string, nameId: number, direction: 'like' | 'nope') {
  return api().post(`/api/rooms/${code}/members/${memberId}/swipes`).send({ nameId, direction });
}

function undo(code: string, memberId: string, nameId: number) {
  return api().delete(`/api/rooms/${code}/members/${memberId}/swipes/${nameId}`);
}

/** Derived matches for the room, checked straight against the swipes rows. */
function derivedMatches(room: schema.Room): { nameId: number; display: string }[] {
  return findDerivedMatches(testDb.db, room);
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

function expectUnifiedError(body: unknown, code: string): ErrorEnvelope['error'] {
  expect(Object.keys(body as object)).toEqual(['error']);
  const { error } = body as ErrorEnvelope;
  expect(error.code).toBe(code);
  expect(error.message).toBeTypeOf('string');
  expect(error.message).not.toBe('');
  return error;
}

describe('POST /api/rooms/:code/members/:memberId/swipes — match lifecycle', () => {
  it('full lifecycle: first like is matchless, second like matches, undo un-matches, re-like re-matches', async () => {
    seedStandardFixtures();
    const { code, room, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    const first = await swipe(code, ada, aria, 'like');
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ match: false });
    expect(derivedMatches(room)).toEqual([]);

    const second = await swipe(code, belle, aria, 'like');
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ match: true });
    expect(derivedMatches(room)).toEqual([{ nameId: aria, display: 'Aria' }]);

    const undone = await undo(code, belle, aria);
    expect(undone.status).toBe(204);
    expect(derivedMatches(room)).toEqual([]);

    const relike = await swipe(code, belle, aria, 'like');
    expect(relike.status).toBe(201);
    expect(relike.body).toEqual({ match: true });
    expect(derivedMatches(room)).toEqual([{ nameId: aria, display: 'Aria' }]);
  });

  it('undoing either side removes the derived match immediately', async () => {
    seedStandardFixtures();
    const { code, room, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    await swipe(code, ada, aria, 'like');
    await swipe(code, belle, aria, 'like');
    expect(derivedMatches(room)).toEqual([{ nameId: aria, display: 'Aria' }]);

    // The FIRST liker undoing also un-matches — the flag was never stored.
    expect(await undo(code, ada, aria)).toMatchObject({ status: 204 });
    expect(derivedMatches(room)).toEqual([]);

    // Belle's like still stands solo; her response flag was true once, but
    // the derived query has no stale row to read.
    expect(testDb.db.select().from(schema.swipes).all()).toHaveLength(1);
  });

  it('matches accumulate per name and never leak across names', async () => {
    seedStandardFixtures();
    const { code, room, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');
    const bruno = nameIdByDisplay('Bruno');

    expect((await swipe(code, ada, aria, 'like')).body).toEqual({ match: false });
    expect((await swipe(code, ada, bruno, 'like')).body).toEqual({ match: false });
    expect((await swipe(code, belle, aria, 'like')).body).toEqual({ match: true });
    // Bruno is only half-liked: no match for him.
    expect(derivedMatches(room)).toEqual([{ nameId: aria, display: 'Aria' }]);

    expect((await swipe(code, belle, bruno, 'like')).body).toEqual({ match: true });
    expect(derivedMatches(room)).toEqual([
      { nameId: aria, display: 'Aria' },
      { nameId: bruno, display: 'Bruno' },
    ]);
  });
});

describe('POST swipes — nope never matches', () => {
  it('partner nope after a like: match false, no derived match', async () => {
    seedStandardFixtures();
    const { code, room, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    expect((await swipe(code, ada, aria, 'like')).body).toEqual({ match: false });
    const nope = await swipe(code, belle, aria, 'nope');
    expect(nope.status).toBe(201);
    expect(nope.body).toEqual({ match: false });
    expect(derivedMatches(room)).toEqual([]);
  });

  it('like after partner nope: match false (a nope is not half a match)', async () => {
    seedStandardFixtures();
    const { code, room, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    expect((await swipe(code, ada, aria, 'nope')).body).toEqual({ match: false });
    expect((await swipe(code, belle, aria, 'like')).body).toEqual({ match: false });
    expect(derivedMatches(room)).toEqual([]);
  });

  it('nope + nope: match false', async () => {
    seedStandardFixtures();
    const { code, room, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    expect((await swipe(code, ada, aria, 'nope')).body).toEqual({ match: false });
    expect((await swipe(code, belle, aria, 'nope')).body).toEqual({ match: false });
    expect(derivedMatches(room)).toEqual([]);
  });
});

describe('POST swipes — error paths', () => {
  it('re-swiping the same name is 409, in either direction', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const [ada] = memberIds;
    const aria = nameIdByDisplay('Aria');

    expect((await swipe(code, ada, aria, 'like')).status).toBe(201);

    const again = await swipe(code, ada, aria, 'like');
    expect(again.status).toBe(409);
    expectUnifiedError(again.body, 'swipe_already_exists');

    const flipped = await swipe(code, ada, aria, 'nope');
    expect(flipped.status).toBe(409);
    expectUnifiedError(flipped.body, 'swipe_already_exists');

    expect(testDb.db.select().from(schema.swipes).all()).toHaveLength(1);
  });

  it('unknown nameId is 404', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const response = await swipe(code, memberIds[0], 999_999, 'like');

    expect(response.status).toBe(404);
    const error = expectUnifiedError(response.body, 'name_not_found');
    expect(error.message).toContain('999999');
  });

  it('a name outside the room datasets (another room’s dataset) is 422', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const dov = nameIdByDisplay('Dov'); // seeded, but only via 'beta'

    const response = await swipe(code, memberIds[0], dov, 'like');

    expect(response.status).toBe(422);
    expectUnifiedError(response.body, 'name_not_in_room');
    expect(testDb.db.select().from(schema.swipes).all()).toHaveLength(0);
  });

  it('a name IS swipable when the room configures multiple datasets', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom({ ...alphaConfig(), datasets: ['alpha', 'beta'] }, [
      'Ada',
    ]);
    const dov = nameIdByDisplay('Dov');

    const response = await swipe(code, memberIds[0], dov, 'like');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ match: false });
  });

  it('unknown room is 404; member of another room is 404', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const other = await openRoom(alphaConfig(), ['Zoe']);
    const aria = nameIdByDisplay('Aria');

    const unknownRoom = await swipe('ZZZZZ9', memberIds[0], aria, 'like');
    expect(unknownRoom.status).toBe(404);
    expectUnifiedError(unknownRoom.body, 'room_not_found');

    const foreignMember = await swipe(code, other.memberIds[0], aria, 'like');
    expect(foreignMember.status).toBe(404);
    expectUnifiedError(foreignMember.body, 'member_not_found');

    const ghostMember = await swipe(code, 'not-a-real-token', aria, 'like');
    expect(ghostMember.status).toBe(404);
    expectUnifiedError(ghostMember.body, 'member_not_found');
  });

  it('invalid body renders 422 with field-level issues', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const aria = nameIdByDisplay('Aria');
    const url = `/api/rooms/${code}/members/${memberIds[0]}/swipes`;

    const badDirection = await api().post(url).send({ nameId: aria, direction: 'maybe' });
    expect(badDirection.status).toBe(422);
    const error = expectUnifiedError(badDirection.body, 'validation_error');
    expect(error.details!.map((detail) => detail.path)).toContain('direction');

    const missingName = await api().post(url).send({ direction: 'like' });
    expect(missingName.status).toBe(422);
    expect(
      expectUnifiedError(missingName.body, 'validation_error').details!.map((d) => d.path),
    ).toContain('nameId');

    const nonInteger = await api().post(url).send({ nameId: 1.5, direction: 'like' });
    expect(nonInteger.status).toBe(422);
  });
});

describe('POST swipes — solo room', () => {
  it('a solo member swipes fine; match is always false', async () => {
    seedStandardFixtures();
    const { code, room, memberIds } = await openRoom(alphaConfig(), ['Solo']);
    const aria = nameIdByDisplay('Aria');
    const bruno = nameIdByDisplay('Bruno');

    const like = await swipe(code, memberIds[0], aria, 'like');
    expect(like.status).toBe(201);
    expect(like.body).toEqual({ match: false });

    const nope = await swipe(code, memberIds[0], bruno, 'nope');
    expect(nope.status).toBe(201);
    expect(nope.body).toEqual({ match: false });

    // Both rows recorded; nothing matched because nobody else swiped.
    expect(testDb.db.select().from(schema.swipes).all()).toHaveLength(2);
    expect(derivedMatches(room)).toEqual([]);
  });
});

describe('DELETE swipes — undo', () => {
  it('returns 204, deletes exactly that member’s row, and frees a re-swipe', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    await swipe(code, ada, aria, 'like');
    await swipe(code, belle, aria, 'like');

    const response = await undo(code, belle, aria);
    expect(response.status).toBe(204);
    expect(response.body).toEqual({});

    const remaining = testDb.db.select().from(schema.swipes).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].memberId).not.toBe(
      testDb.db.select().from(schema.members).where(eq(schema.members.token, belle)).get()!.id,
    );

    const relike = await swipe(code, belle, aria, 'like');
    expect(relike.status).toBe(201);
    expect(relike.body).toEqual({ match: true });
  });

  it('absent swipe is 404 (never swiped, unknown name, or already undone)', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const [ada] = memberIds;
    const aria = nameIdByDisplay('Aria');
    const bruno = nameIdByDisplay('Bruno');

    const never = await undo(code, ada, aria);
    expect(never.status).toBe(404);
    expectUnifiedError(never.body, 'swipe_not_found');

    await swipe(code, ada, aria, 'like');
    const wrongName = await undo(code, ada, bruno);
    expect(wrongName.status).toBe(404);
    expectUnifiedError(wrongName.body, 'swipe_not_found');

    expect(await undo(code, ada, aria)).toMatchObject({ status: 204 });
    const twice = await undo(code, ada, aria);
    expect(twice.status).toBe(404);
    expectUnifiedError(twice.body, 'swipe_not_found');
  });

  it('non-numeric nameId param renders 400 validation_error', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);

    const response = await api().delete(
      `/api/rooms/${code}/members/${memberIds[0]}/swipes/not-a-number`,
    );

    expect(response.status).toBe(400);
    const error = expectUnifiedError(response.body, 'validation_error');
    expect(error.details!.map((detail) => detail.path)).toContain('nameId');
  });

  it('undoing returns the name to the member’s deck', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada] = memberIds;
    const aria = nameIdByDisplay('Aria');

    const deckUrl = `/api/rooms/${code}/members/${ada}/deck`;
    const before = await api().get(deckUrl);
    expect(before.body.names.map((n: { nameId: number }) => n.nameId)).toContain(aria);

    await swipe(code, ada, aria, 'nope');
    const swiped = await api().get(deckUrl);
    expect(swiped.body.names.map((n: { nameId: number }) => n.nameId)).not.toContain(aria);

    expect(await undo(code, ada, aria)).toMatchObject({ status: 204 });
    const restored = await api().get(deckUrl);
    expect(restored.body.names.map((n: { nameId: number }) => n.nameId)).toContain(aria);
  });
});

describe('storage direction vocabulary', () => {
  it('API ’nope’ is stored as the schema’s ‘dislike’ value', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const aria = nameIdByDisplay('Aria');

    await swipe(code, memberIds[0], aria, 'nope');

    const row = testDb.db.select().from(schema.swipes).all();
    expect(row).toHaveLength(1);
    expect(row[0].direction).toBe('dislike');
    expect(row[0].nameId).toBe(aria);
  });
});
