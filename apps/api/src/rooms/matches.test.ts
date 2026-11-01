import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import { createTestDb, type TestDb } from '../db/testing.js';
import type { ParsedDataset } from '../data/contract.js';
import { mergeDatasets } from '../data/merge.js';
import { seedDatabase } from '../data/seed.js';
import { entry, fixtureDataset } from '../data/testkit.js';
import type { RoomConfig } from './config.js';
import { createRoomsRouter } from './router.js';

/**
 * Matches & likes endpoint integration tests.
 *
 * Every test gets its own migrated temp SQLite file and its own app
 * instance — no shared state. matchedAt/likedAt ordering is made fully
 * deterministic by writing explicit created_at values onto the swipes
 * rows after recording them through the public API (wall-clock inserts
 * can share a millisecond; the fixture times never do).
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

const ALPHA_ENTRIES = [
  entry('Aria', {
    gender: 'girl',
    romanization: 'AH-ree-ah',
    meaning: 'air; lioness',
    origin: 'Italian',
  }),
  entry('Bruno', { gender: 'boy' }),
  // Cleo lives in BOTH datasets: alpha (sort 10) is walked before beta
  // (sort 20), so alpha's meaning/origin win while beta supplies the
  // romanization alpha lacks — the deck's pick-first rule.
  entry('Cleo', { gender: 'girl', meaning: 'glory', origin: 'Greek' }),
  entry('Dara', { gender: 'neutral' }),
];
const BETA_ENTRIES = [
  entry('Dov', { gender: 'boy' }),
  entry('Cleo', { gender: 'girl', meaning: 'moon of beta', romanization: 'KLEH-oh' }),
];

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

function getMatches(code: string) {
  return api().get(`/api/rooms/${code}/matches`);
}

function getLikes(code: string, memberId: string) {
  return api().get(`/api/rooms/${code}/members/${memberId}/likes`);
}

/** Fixture-shaped control over a like's created_at — ordering without wall-clock luck. */
function setLikeTime(memberId: string, display: string, at: Date): void {
  const member = testDb.db
    .select()
    .from(schema.members)
    .where(eq(schema.members.token, memberId))
    .get();
  expect(member, `member '${memberId}' should exist`).toBeDefined();
  const updated = testDb.db
    .update(schema.swipes)
    .set({ createdAt: at })
    .where(
      and(
        eq(schema.swipes.memberId, member!.id),
        eq(schema.swipes.nameId, nameIdByDisplay(display)),
      ),
    )
    .run();
  expect(updated.changes, `a swipe on '${display}' should exist to retime`).toBe(1);
}

/** Deterministic fixture clock — distinct, increasing instants. */
const T = (minutes: number): Date => new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + minutes * 60_000);

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

describe('GET /api/rooms/:code/matches — the derived match list', () => {
  it('returns exactly the both-liked set, most recent mutual like first, with detail fields', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;

    // Aria: mutual, matched at minute 5.
    await swipe(code, ada, nameIdByDisplay('Aria'), 'like');
    await swipe(code, belle, nameIdByDisplay('Aria'), 'like');
    setLikeTime(ada, 'Aria', T(0));
    setLikeTime(belle, 'Aria', T(5));

    // Bruno: mutual, matched at minute 60 — newer, so first.
    await swipe(code, ada, nameIdByDisplay('Bruno'), 'like');
    await swipe(code, belle, nameIdByDisplay('Bruno'), 'like');
    setLikeTime(ada, 'Bruno', T(10));
    setLikeTime(belle, 'Bruno', T(60));

    // Half-liked (only Ada) and noped names never appear.
    await swipe(code, ada, nameIdByDisplay('Cleo'), 'like');
    setLikeTime(ada, 'Cleo', T(90));
    await swipe(code, ada, nameIdByDisplay('Dara'), 'nope');
    await swipe(code, belle, nameIdByDisplay('Dara'), 'like');

    const response = await getMatches(code);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      matches: [
        {
          nameId: nameIdByDisplay('Bruno'),
          display: 'Bruno',
          matchedAt: T(60).toISOString(),
        },
        {
          nameId: nameIdByDisplay('Aria'),
          display: 'Aria',
          romanization: 'AH-ree-ah',
          meaning: 'air; lioness',
          origin: 'Italian',
          matchedAt: T(5).toISOString(),
        },
      ],
    });
  });

  it('matchedAt is the SECOND like’s stamp — when the match came to exist', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;

    await swipe(code, ada, nameIdByDisplay('Aria'), 'like');
    setLikeTime(ada, 'Aria', T(3)); // first like lands at minute 3
    await swipe(code, belle, nameIdByDisplay('Aria'), 'like');
    setLikeTime(belle, 'Aria', T(30)); // second like lands at minute 30

    const response = await getMatches(code);
    // The match was born with the SECOND like — not the first liker’s stamp.
    expect(response.body.matches[0].matchedAt).toBe(T(30).toISOString());
  });

  it('same-millisecond matches tie-break by nameId ascending (total order)', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');
    const bruno = nameIdByDisplay('Bruno');
    const cleo = nameIdByDisplay('Cleo');

    for (const display of ['Aria', 'Bruno', 'Cleo']) {
      await swipe(code, ada, nameIdByDisplay(display), 'like');
      await swipe(code, belle, nameIdByDisplay(display), 'like');
    }
    const sameInstant = T(42);
    for (const member of [ada, belle]) {
      for (const display of ['Aria', 'Bruno', 'Cleo']) {
        setLikeTime(member, display, sameInstant);
      }
    }

    const response = await getMatches(code);
    expect(response.body.matches.map((m: { nameId: number }) => m.nameId)).toEqual(
      [aria, bruno, cleo].sort((a, b) => a - b),
    );
  });

  it('a solo room has no matches, however much the member likes', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Solo']);

    await swipe(code, memberIds[0], nameIdByDisplay('Aria'), 'like');
    await swipe(code, memberIds[0], nameIdByDisplay('Bruno'), 'like');

    const response = await getMatches(code);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ matches: [] });
  });

  it('an empty room matches empty', async () => {
    seedStandardFixtures();
    const { code } = await openRoom(alphaConfig(), []);
    expect((await getMatches(code)).body).toEqual({ matches: [] });
  });

  it('likes from another room never leak into this room’s matches', async () => {
    seedStandardFixtures();
    const ours = await openRoom(alphaConfig(), ['Ada']);
    const theirs = await openRoom(alphaConfig(), ['Zoe', 'Zeke']);

    // Zoe and Zeke (a DIFFERENT room) mutually like Aria.
    await swipe(theirs.code, theirs.memberIds[0], nameIdByDisplay('Aria'), 'like');
    await swipe(theirs.code, theirs.memberIds[1], nameIdByDisplay('Aria'), 'like');

    expect((await getMatches(ours.code)).body).toEqual({ matches: [] });
    expect((await getMatches(theirs.code)).body).toEqual({
      matches: [
        {
          nameId: nameIdByDisplay('Aria'),
          display: 'Aria',
          romanization: 'AH-ree-ah',
          meaning: 'air; lioness',
          origin: 'Italian',
          matchedAt: expect.any(String),
        },
      ],
    });
  });
});

describe('GET /api/rooms/:code/members/:memberId/likes — my liked names', () => {
  it('returns only MY likes (most recent first) with likedAt; nopes and partner swipes never appear', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;

    await swipe(code, ada, nameIdByDisplay('Aria'), 'like');
    setLikeTime(ada, 'Aria', T(0));
    await swipe(code, ada, nameIdByDisplay('Dara'), 'nope'); // a nope is not a like
    await swipe(code, ada, nameIdByDisplay('Bruno'), 'like');
    setLikeTime(ada, 'Bruno', T(15));
    // Partner's swipes are invisible in MY list, whatever their direction.
    await swipe(code, belle, nameIdByDisplay('Cleo'), 'like');
    await swipe(code, belle, nameIdByDisplay('Aria'), 'nope');

    const mine = await getLikes(code, ada);
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual({
      likes: [
        { nameId: nameIdByDisplay('Bruno'), display: 'Bruno', likedAt: T(15).toISOString() },
        {
          nameId: nameIdByDisplay('Aria'),
          display: 'Aria',
          romanization: 'AH-ree-ah',
          meaning: 'air; lioness',
          origin: 'Italian',
          likedAt: T(0).toISOString(),
        },
      ],
    });

    const theirs = await getLikes(code, belle);
    expect(theirs.body).toEqual({
      likes: [
        {
          nameId: nameIdByDisplay('Cleo'),
          display: 'Cleo',
          meaning: 'glory',
          origin: 'Greek',
          likedAt: expect.any(String),
        },
      ],
    });
  });

  it('detail fields follow the deck pick-first rule across room datasets', async () => {
    seedStandardFixtures();
    const bothDatasets = { ...alphaConfig(), datasets: ['alpha', 'beta'] };
    const { code, memberIds } = await openRoom(bothDatasets, ['Ada']);

    await swipe(code, memberIds[0], nameIdByDisplay('Cleo'), 'like');
    await swipe(code, memberIds[0], nameIdByDisplay('Dov'), 'like');

    const response = await getLikes(code, memberIds[0]);
    // Cleo: alpha meaning/origin win; romanization comes from beta.
    const cleo = response.body.likes.find((l: { display: string }) => l.display === 'Cleo');
    expect(cleo).toMatchObject({
      meaning: 'glory',
      origin: 'Greek',
      romanization: 'KLEH-oh',
    });
    // Dov exists only in beta: its row is the only one to walk.
    const dov = response.body.likes.find((l: { display: string }) => l.display === 'Dov');
    expect(dov).toEqual({
      nameId: nameIdByDisplay('Dov'),
      display: 'Dov',
      likedAt: expect.any(String),
    });
  });

  it('likes list is unaffected by the partner having already swiped (both directions pending)', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;

    await swipe(code, belle, nameIdByDisplay('Aria'), 'nope');
    await swipe(code, ada, nameIdByDisplay('Aria'), 'like');

    const response = await getLikes(code, ada);
    expect(response.body.likes).toEqual([
      {
        nameId: nameIdByDisplay('Aria'),
        display: 'Aria',
        romanization: 'AH-ree-ah',
        meaning: 'air; lioness',
        origin: 'Italian',
        likedAt: expect.any(String),
      },
    ]);
  });
});

describe('undo consistency — matches and likes stay coherent', () => {
  it('undo removes the match (matchedAt gone) while the remaining liker still sees their like', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    await swipe(code, ada, aria, 'like');
    setLikeTime(ada, 'Aria', T(0));
    await swipe(code, belle, aria, 'like');
    setLikeTime(belle, 'Aria', T(5));
    expect((await getMatches(code)).body.matches).toHaveLength(1);

    expect(await undo(code, belle, aria)).toMatchObject({ status: 204 });

    // The match — and its matchedAt — is gone from the matches view.
    expect((await getMatches(code)).body).toEqual({ matches: [] });
    // ...but Ada's like survives untouched in her likes view.
    expect((await getLikes(code, ada)).body).toEqual({
      likes: [
        {
          nameId: aria,
          display: 'Aria',
          romanization: 'AH-ree-ah',
          meaning: 'air; lioness',
          origin: 'Italian',
          likedAt: T(0).toISOString(),
        },
      ],
    });
    // The undoer's list no longer carries the name.
    expect((await getLikes(code, belle)).body).toEqual({ likes: [] });
  });

  it('undoing the FIRST liker un-matches too; the second liker’s like remains', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    await swipe(code, ada, aria, 'like');
    setLikeTime(ada, 'Aria', T(0));
    await swipe(code, belle, aria, 'like');
    setLikeTime(belle, 'Aria', T(5));

    expect(await undo(code, ada, aria)).toMatchObject({ status: 204 });

    expect((await getMatches(code)).body).toEqual({ matches: [] });
    expect((await getLikes(code, belle)).body).toEqual({
      likes: [
        {
          nameId: aria,
          display: 'Aria',
          romanization: 'AH-ree-ah',
          meaning: 'air; lioness',
          origin: 'Italian',
          likedAt: T(5).toISOString(),
        },
      ],
    });
  });

  it('re-liking after an undo re-matches with a NEW matchedAt', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada', 'Belle']);
    const [ada, belle] = memberIds;
    const aria = nameIdByDisplay('Aria');

    await swipe(code, ada, aria, 'like');
    setLikeTime(ada, 'Aria', T(0));
    await swipe(code, belle, aria, 'like');
    setLikeTime(belle, 'Aria', T(5));
    await undo(code, belle, aria);

    await swipe(code, belle, aria, 'like');
    setLikeTime(belle, 'Aria', T(120));

    const response = await getMatches(code);
    expect(response.body.matches).toEqual([
      {
        nameId: aria,
        display: 'Aria',
        romanization: 'AH-ree-ah',
        meaning: 'air; lioness',
        origin: 'Italian',
        matchedAt: T(120).toISOString(),
      },
    ]);
  });
});

describe('error paths — 404s per the unified error contract', () => {
  it('unknown room on both endpoints is 404 room_not_found', async () => {
    seedStandardFixtures();
    const { memberIds } = await openRoom(alphaConfig(), ['Ada']);

    const matches = await getMatches('ZZZZZ9');
    expect(matches.status).toBe(404);
    expectUnifiedError(matches.body, 'room_not_found');

    const likes = await getLikes('ZZZZZ9', memberIds[0]);
    expect(likes.status).toBe(404);
    expectUnifiedError(likes.body, 'room_not_found');
  });

  it('unknown or foreign member on likes is 404 member_not_found', async () => {
    seedStandardFixtures();
    const { code, memberIds } = await openRoom(alphaConfig(), ['Ada']);
    const other = await openRoom(alphaConfig(), ['Zoe']);

    const ghost = await getLikes(code, 'not-a-real-token');
    expect(ghost.status).toBe(404);
    expectUnifiedError(ghost.body, 'member_not_found');

    const foreign = await getLikes(code, other.memberIds[0]);
    expect(foreign.status).toBe(404);
    expectUnifiedError(foreign.body, 'member_not_found');

    // The real member's list still works — the probes changed nothing.
    expect((await getLikes(code, memberIds[0])).body).toEqual({ likes: [] });
  });

  it('malformed room code renders 400 validation_error', async () => {
    seedStandardFixtures();

    const badMatches = await api().get('/api/rooms/not-a-code/matches');
    expect(badMatches.status).toBe(400);
    expectUnifiedError(badMatches.body, 'validation_error');

    const badLikes = await api().get('/api/rooms/not-a-code/members/xyz/likes');
    expect(badLikes.status).toBe(400);
    expectUnifiedError(badLikes.body, 'validation_error');
  });
});
