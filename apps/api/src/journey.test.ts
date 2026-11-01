import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from './app.js';
import * as schema from './db/schema.js';
import { createTestDb, type TestDb } from './db/testing.js';
import type { ParsedDataset } from './data/contract.js';
import { loadDataDir } from './data/loader.js';
import { mergeDatasets } from './data/merge.js';
import { seedDatabase } from './data/seed.js';
import { entry, fixtureDataset } from './data/testkit.js';
import { validateDataDir } from './data/validate.js';
import type { RoomConfig } from './rooms/config.js';
import { createRoomsRouter } from './rooms/router.js';

/**
 * The API epic's final proof: one continuous two-partner journey through the
 * public HTTP surface, plus a sweep pinning the exact error bodies.
 *
 * Seeding exercises BOTH fixture sources: the committed data/samples files
 * through the real validate → load → merge → seed pipeline, and testkit-built
 * datasets merged in alongside them. The journey then runs create → join A →
 * join B → decks → A likes 5 → B likes 3 (2 overlapping) → matches → undo →
 * re-like entirely over supertest, in that order, in one test.
 *
 * Match ordering (most recent mutual like first) is asserted for real: the
 * decisive likes are separated by sleep(3), and swipes.created_at carries
 * millisecond precision — so the timestamps the ordering reads are strictly
 * separated, never wall-clock-lucky.
 */

const SAMPLES_DIR = fileURLToPath(new URL('../../../data/samples', import.meta.url));
const SAMPLE_KEYS = ['sample-us', 'sample-nordic', 'sample-es'];

/** Every deck candidate for the journey config, sorted the way we compare. */
const EXPECTED_DECK_DISPLAYS = [
  'Aria',
  'Astrid',
  'Björn',
  'Bruno',
  'Emma',
  'Freja',
  'Inés',
  'Jose',
  'Kai',
  'Liam',
  'Lucía',
  'Maja',
  'Mateo',
  'Noah',
  'Olivia',
  'Santiago',
  'Sofia',
  'Åsa',
].sort();

/** Milliseconds of guaranteed separation between decisive like timestamps. */
const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 3));

let testDb: TestDb;
let app: ReturnType<typeof buildApp>;

beforeAll(() => {
  testDb = createTestDb();

  // The committed sample fixtures are a real pipeline input: validate them,
  // load them, then merge them with the testkit dataset in one seed.
  const validation = validateDataDir(SAMPLES_DIR);
  expect(validation.ok, JSON.stringify(validation.violations)).toBe(true);
  expect(validation.datasetCount).toBe(SAMPLE_KEYS.length);

  const { datasets: samples, errors } = loadDataDir(SAMPLES_DIR);
  expect(errors).toEqual([]);

  const kit: ParsedDataset[] = [
    fixtureDataset('alpha', 5, [
      entry('Aria', { gender: 'girl', meaning: 'air; lioness', origin: 'Italian' }),
      entry('Bruno', { gender: 'boy' }),
      // Neutral-only: the journey room configures genders ['boy', 'girl'],
      // so Rowan must never surface in a deck.
      entry('Rowan', { gender: 'neutral' }),
    ]),
  ];

  const datasets = [...kit, ...samples];
  const { names } = mergeDatasets(datasets);
  seedDatabase(testDb.db, datasets, names);

  app = buildApp([createRoomsRouter(testDb.db)]);
});

afterAll(() => {
  testDb.cleanup();
});

function api() {
  return request(app);
}

function nameIdByDisplay(display: string): number {
  const name = testDb.db.select().from(schema.names).where(eq(schema.names.display, display)).get();
  expect(name, `fixture name '${display}' should be seeded`).toBeDefined();
  return name!.id;
}
interface DeckName {
  nameId: number;
  display: string;
  romanization?: string;
  meaning?: string;
  origin?: string;
  genderTags: string[];
  datasets: string[];
  tier: string;
}

function deckNames(body: unknown): DeckName[] {
  return (body as { names: DeckName[] }).names;
}

function deckDisplays(body: unknown): string[] {
  return deckNames(body).map((name) => name.display);
}

function deckNameIds(body: unknown): number[] {
  return deckNames(body).map((name) => name.nameId);
}

function deckName(body: unknown, display: string): DeckName {
  const name = deckNames(body).find((candidate) => candidate.display === display);
  expect(name, `expected '${display}' in the deck`).toBeDefined();
  return name!;
}

function isoTimestamp(value: unknown): string {
  expect(value).toBeTypeOf('string');
  expect(Number.isNaN(Date.parse(value as string))).toBe(false);
  return value as string;
}

// -- the journey ----------------------------------------------------------------------

describe('two-partner journey over the public API', () => {
  it('create room → join A → join B → decks → likes → matches → undo → re-like', async () => {
    // 1. Create a room from a MULTI-dataset config: the testkit fixture plus
    //    all three committed sample datasets.
    const config: RoomConfig = {
      datasets: ['alpha', ...SAMPLE_KEYS],
      genders: ['boy', 'girl'],
      tiers: ['popular', 'uncommon', 'rare', 'unranked'],
    };
    const created = await api().post('/api/rooms').send(config);
    expect(created.status, created.text).toBe(201);
    expect(Object.keys(created.body)).toEqual(['code', 'room']);

    const code = created.body.code as string;
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(created.body.room).toEqual({
      id: expect.any(Number),
      code,
      config,
      createdAt: isoTimestamp(created.body.room.createdAt),
    });

    const roomFresh = await api().get(`/api/rooms/${code}`);
    expect(roomFresh.status).toBe(200);
    expect(roomFresh.body.memberCount).toBe(0);
    expect(roomFresh.body.room.config).toEqual(config);
    expect(roomFresh.body.config).toEqual(config);

    // 2. Join A, then join B.
    const joinA = await api().post(`/api/rooms/${code}/join`).send({ nickname: 'Ada' });
    expect(joinA.status, joinA.text).toBe(201);
    expect(Object.keys(joinA.body)).toEqual(['memberId', 'nickname', 'joinedAt']);
    expect(joinA.body.nickname).toBe('Ada');
    isoTimestamp(joinA.body.joinedAt);
    const ada = joinA.body.memberId as string;
    expect(ada).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const joinB = await api().post(`/api/rooms/${code}/join`).send({ nickname: 'Belle' });
    expect(joinB.status, joinB.text).toBe(201);
    const belle = joinB.body.memberId as string;
    expect(belle).not.toBe(ada);

    const members = await api().get(`/api/rooms/${code}/members`);
    expect(members.status).toBe(200);
    expect(members.body.map((member: { memberId: string }) => member.memberId)).toEqual([
      ada,
      belle,
    ]);
    expect(members.body.map((member: { nickname: string }) => member.nickname)).toEqual([
      'Ada',
      'Belle',
    ]);

    // 3. Both partners fetch their decks: same candidate set, independently
    //    shuffled per member.
    const deckA1 = await api().get(`/api/rooms/${code}/members/${ada}/deck`);
    const deckB1 = await api().get(`/api/rooms/${code}/members/${belle}/deck`);
    expect(deckA1.status).toBe(200);
    expect(deckB1.status).toBe(200);

    const aIds1 = deckNameIds(deckA1.body);
    const bIds1 = deckNameIds(deckB1.body);
    expect(aIds1).toHaveLength(EXPECTED_DECK_DISPLAYS.length); // 16 samples + Aria + Bruno
    expect([...bIds1].sort()).toEqual([...aIds1].sort()); // same set, whatever the order
    expect(deckDisplays(deckA1.body).sort()).toEqual(EXPECTED_DECK_DISPLAYS);
    expect(deckDisplays(deckA1.body)).not.toContain('Rowan'); // neutral filtered by config

    // Multi-dataset enrichment on the merged sample names.
    const kai = deckName(deckA1.body, 'Kai');
    expect(kai.genderTags).toEqual(['boy', 'neutral']);
    expect(kai.datasets).toEqual(['sample-us', 'sample-nordic']);
    expect(kai.tier).toBe('popular');
    expect(kai.meaning).toBe('variously sea, victory, or fire across Nordic languages');
    expect(deckName(deckA1.body, 'Jose').datasets).toEqual(['sample-us', 'sample-es']);
    expect(deckName(deckA1.body, 'Astrid').tier).toBe('uncommon');
    expect(deckName(deckA1.body, 'Freja').tier).toBe('rare');
    expect(deckName(deckA1.body, 'Åsa').tier).toBe('unranked');
    expect(deckName(deckA1.body, 'Aria').datasets).toEqual(['alpha']);

    // 4. A likes 5 names. No partner like exists yet: every flag is false.
    const liam = nameIdByDisplay('Liam');
    const noah = nameIdByDisplay('Noah');
    const olivia = nameIdByDisplay('Olivia');
    const emma = nameIdByDisplay('Emma');
    const astrid = nameIdByDisplay('Astrid');
    const freja = nameIdByDisplay('Freja');
    const aLikes = [liam, noah, olivia, emma, astrid];

    for (const nameId of aLikes) {
      const response = await api()
        .post(`/api/rooms/${code}/members/${ada}/swipes`)
        .send({ nameId, direction: 'like' });
      expect(response.status, response.text).toBe(201);
      expect(response.body).toEqual({ match: false });
    }

    // Disjoint exclusions: A's swipes shrink ONLY A's deck (and do so as a
    // stable subsequence — survivors never reshuffle); B's deck is untouched.
    const deckA2 = await api().get(`/api/rooms/${code}/members/${ada}/deck`);
    const deckB2 = await api().get(`/api/rooms/${code}/members/${belle}/deck`);
    expect(deckA2.status).toBe(200);
    expect(deckB2.status).toBe(200);
    const swipedByA = new Set(aLikes);
    expect(deckNameIds(deckA2.body)).toEqual(aIds1.filter((id) => !swipedByA.has(id)));
    expect(deckB2.body).toEqual(deckB1.body); // byte-for-byte: A's swipes never reach B
    for (const nameId of aLikes) {
      expect(deckNameIds(deckB2.body)).toContain(nameId);
    }

    // 5. B likes 3 names, 2 of which overlap A's likes. The overlap likes are
    //    timestamp-ordered by the sleeps: Freja < Liam < Emma.
    const bFreja = await api()
      .post(`/api/rooms/${code}/members/${belle}/swipes`)
      .send({ nameId: freja, direction: 'like' });
    expect(bFreja.body).toEqual({ match: false }); // A never liked Freja
    await sleep();

    const bLiam = await api()
      .post(`/api/rooms/${code}/members/${belle}/swipes`)
      .send({ nameId: liam, direction: 'like' });
    expect(bLiam.body).toEqual({ match: true }); // completes A's like
    await sleep();

    const bEmma = await api()
      .post(`/api/rooms/${code}/members/${belle}/swipes`)
      .send({ nameId: emma, direction: 'like' });
    expect(bEmma.body).toEqual({ match: true });

    // B's own deck now excludes exactly her three swipes.
    const deckB3 = await api().get(`/api/rooms/${code}/members/${belle}/deck`);
    expect(deckB3.status).toBe(200);
    const bSwiped = new Set([freja, liam, emma]);
    expect(deckNameIds(deckB3.body)).toEqual(bIds1.filter((id) => !bSwiped.has(id)));

    // 6. Matches are exactly the 2-name overlap, most recent mutual like
    //    first: Emma's second like landed after Liam's.
    const matches1 = await api().get(`/api/rooms/${code}/matches`);
    expect(matches1.status).toBe(200);
    expect(
      matches1.body.matches.map((m: { nameId: number; display: string }) => [m.nameId, m.display]),
    ).toEqual([
      [emma, 'Emma'],
      [liam, 'Liam'],
    ]);
    const emmaMatch1 = matches1.body.matches[0];
    const liamMatch1 = matches1.body.matches[1];
    expect(isoTimestamp(emmaMatch1.matchedAt) > isoTimestamp(liamMatch1.matchedAt)).toBe(true);
    // Match cards carry the same pick-first passthrough the deck cards did.
    expect(emmaMatch1).toMatchObject({
      nameId: emma,
      display: 'Emma',
      meaning: 'whole, universal',
      origin: 'Germanic',
    });
    expect(liamMatch1).toMatchObject({
      nameId: liam,
      display: 'Liam',
      meaning: 'resolute protector',
      origin: 'Germanic, via William',
    });

    // 7. B undoes one overlap: the match un-derives, Emma returns to B's deck.
    const undo = await api().delete(`/api/rooms/${code}/members/${belle}/swipes/${emma}`);
    expect(undo.status).toBe(204);
    expect(undo.body).toEqual({});

    const matches2 = await api().get(`/api/rooms/${code}/matches`);
    expect(matches2.body.matches.map((m: { display: string }) => m.display)).toEqual(['Liam']);

    const deckB4 = await api().get(`/api/rooms/${code}/members/${belle}/deck`);
    expect(deckB4.status).toBe(200);
    expect(deckNameIds(deckB4.body)).toEqual(bIds1.filter((id) => id !== freja && id !== liam));

    // 8. B re-likes Emma: the pair matches again — and Emma's fresh second
    //    like is now the MOST recent mutual like, so she leads the list.
    await sleep();
    const relike = await api()
      .post(`/api/rooms/${code}/members/${belle}/swipes`)
      .send({ nameId: emma, direction: 'like' });
    expect(relike.status).toBe(201);
    expect(relike.body).toEqual({ match: true });

    const matches3 = await api().get(`/api/rooms/${code}/matches`);
    expect(
      matches3.body.matches.map((m: { nameId: number; display: string }) => [m.nameId, m.display]),
    ).toEqual([
      [emma, 'Emma'],
      [liam, 'Liam'],
    ]);
    expect(
      isoTimestamp(matches3.body.matches[0].matchedAt) >
        isoTimestamp(matches3.body.matches[1].matchedAt),
    ).toBe(true);

    // 9. The two list screens agree with everything above.
    const likesA = await api().get(`/api/rooms/${code}/members/${ada}/likes`);
    expect(likesA.status).toBe(200);
    expect([...likesA.body.likes.map((like: { nameId: number }) => like.nameId)].sort()).toEqual(
      [...aLikes].sort(),
    );
    for (const like of likesA.body.likes) {
      isoTimestamp(like.likedAt);
    }

    const likesB = await api().get(`/api/rooms/${code}/members/${belle}/likes`);
    expect(likesB.status).toBe(200);
    // B liked Freja < Liam < Emma-re-like: strictly recency-ordered.
    expect(likesB.body.likes.map((like: { display: string }) => like.display)).toEqual([
      'Emma',
      'Liam',
      'Freja',
    ]);

    const roomFinal = await api().get(`/api/rooms/${code}`);
    expect(roomFinal.status).toBe(200);
    expect(roomFinal.body.memberCount).toBe(2);
  });
});

// -- the error-contract sweep -----------------------------------------------------------

interface ErrorDetail {
  path: string;
  message: string;
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: ErrorDetail[] };
}

/**
 * The unified error body: exactly one `error` key; `code` and `message`
 * always; `details` (each exactly {path, message}) only on validation_error.
 */
function expectErrorEnvelope(body: unknown, code: string): ErrorEnvelope['error'] {
  expect(Object.keys(body as object)).toEqual(['error']);
  const { error } = body as ErrorEnvelope;
  const expectedKeys = ['code', 'message'];
  if ('details' in error) {
    expectedKeys.push('details');
  }
  expect(Object.keys(error)).toEqual(expectedKeys);
  expect(error.code).toBe(code);
  expect(error.message).toBeTypeOf('string');
  expect(error.message).not.toBe('');
  for (const detail of error.details ?? []) {
    expect(Object.keys(detail)).toEqual(['path', 'message']);
    expect(detail.path).toBeTypeOf('string');
    expect(detail.message).toBeTypeOf('string');
  }
  return error;
}

/** A fresh room through the public API with `nicknames` joined, on `datasets`. */
async function openRoom(
  datasets: string[],
  nicknames: string[],
): Promise<{ code: string; memberIds: string[] }> {
  const created = await api()
    .post('/api/rooms')
    .send({
      datasets,
      genders: ['boy', 'girl'],
      tiers: ['popular', 'uncommon', 'rare', 'unranked'],
    } satisfies RoomConfig);
  expect(created.status, created.text).toBe(201);
  const code = created.body.code as string;
  const memberIds: string[] = [];
  for (const nickname of nicknames) {
    const joined = await api().post(`/api/rooms/${code}/join`).send({ nickname });
    expect(joined.status, joined.text).toBe(201);
    memberIds.push(joined.body.memberId as string);
  }
  return { code, memberIds };
}

describe('error-contract sweep — exact 404/409/422 bodies', () => {
  it('404 unknown room and unknown route: { error: { code, message } } with no details key', async () => {
    const room = await api().get('/api/rooms/ZZZZZ9');
    expect(room.status).toBe(404);
    expect(room.body).toEqual({
      error: { code: 'room_not_found', message: "No room with code 'ZZZZZ9'" },
    });
    expectErrorEnvelope(room.body, 'room_not_found');

    const route = await api().get('/api/definitely-not-a-route');
    expect(route.status).toBe(404);
    expect(route.body).toEqual({
      error: { code: 'not_found', message: 'Unknown route: GET /api/definitely-not-a-route' },
    });
  });

  it('404 member_not_found / name_not_found / swipe_not_found', async () => {
    const { code, memberIds } = await openRoom(['sample-us'], ['Sweeper']);
    const memberId = memberIds[0]!;
    const stranger = 'not-a-real-member-token';
    const liam = nameIdByDisplay('Liam');

    const deck = await api().get(`/api/rooms/${code}/members/${stranger}/deck`);
    expect(deck.status).toBe(404);
    expect(deck.body).toEqual({
      error: {
        code: 'member_not_found',
        message: `No member '${stranger}' in room '${code}'`,
      },
    });
    expectErrorEnvelope(deck.body, 'member_not_found');

    const ghostName = await api()
      .post(`/api/rooms/${code}/members/${memberId}/swipes`)
      .send({ nameId: 999_999, direction: 'like' });
    expect(ghostName.status).toBe(404);
    expect(ghostName.body).toEqual({
      error: { code: 'name_not_found', message: 'No name with id 999999' },
    });
    expectErrorEnvelope(ghostName.body, 'name_not_found');

    const neverSwiped = await api().delete(`/api/rooms/${code}/members/${memberId}/swipes/${liam}`);
    expect(neverSwiped.status).toBe(404);
    expect(neverSwiped.body).toEqual({
      error: { code: 'swipe_not_found', message: `No swipe by this member on name ${liam}` },
    });
    expectErrorEnvelope(neverSwiped.body, 'swipe_not_found');
  });

  it('409 room_full and swipe_already_exists', async () => {
    const { code, memberIds } = await openRoom(['sample-us'], ['Ada', 'Belle']);
    const liam = nameIdByDisplay('Liam');

    const third = await api().post(`/api/rooms/${code}/join`).send({ nickname: 'Cara' });
    expect(third.status).toBe(409);
    expect(third.body).toEqual({
      error: { code: 'room_full', message: `Room '${code}' is full (2 members)` },
    });
    expectErrorEnvelope(third.body, 'room_full');

    const swipe = async (nameId: number) =>
      api()
        .post(`/api/rooms/${code}/members/${memberIds[0]}/swipes`)
        .send({ nameId, direction: 'like' });
    expect((await swipe(liam)).status).toBe(201);

    const again = await swipe(liam);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({
      error: {
        code: 'swipe_already_exists',
        message: "Member already swiped 'Liam' — undo it first to re-swipe",
      },
    });
    expectErrorEnvelope(again.body, 'swipe_already_exists');
  });

  it('422 room-config validation_error with exact field-level issues', async () => {
    const unknownDataset = await api()
      .post('/api/rooms')
      .send({
        datasets: ['sample-us', 'ghost-dataset'],
        genders: ['boy', 'girl'],
        tiers: ['popular'],
      } satisfies RoomConfig);
    expect(unknownDataset.status).toBe(422);
    expect(unknownDataset.body).toEqual({
      error: {
        code: 'validation_error',
        message: 'Invalid room config',
        details: [{ path: 'datasets', message: "Unknown dataset: 'ghost-dataset'" }],
      },
    });

    const emptyDatasets = await api()
      .post('/api/rooms')
      .send({
        datasets: [],
        genders: ['boy'],
        tiers: ['popular'],
      } satisfies RoomConfig);
    expect(emptyDatasets.status).toBe(422);
    expect(emptyDatasets.body).toEqual({
      error: {
        code: 'validation_error',
        message: 'Invalid request body',
        details: [{ path: 'datasets', message: 'pick at least one dataset' }],
      },
    });
    expectErrorEnvelope(emptyDatasets.body, 'validation_error');
  });

  it('422 name_not_in_room for a name outside the configured datasets', async () => {
    const { code, memberIds } = await openRoom(['sample-us'], ['Ada']); // Astrid is nordic-only
    const astrid = nameIdByDisplay('Astrid');

    const response = await api()
      .post(`/api/rooms/${code}/members/${memberIds[0]}/swipes`)
      .send({ nameId: astrid, direction: 'like' });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: {
        code: 'name_not_in_room',
        message: `Name 'Astrid' is not in room '${code}' datasets`,
      },
    });
    expectErrorEnvelope(response.body, 'name_not_in_room');
  });

  it('422 invalid join and swipe bodies: issues point at the offending field', async () => {
    const { code, memberIds } = await openRoom(['sample-us'], ['Ada']);
    const memberId = memberIds[0]!;
    const liam = nameIdByDisplay('Liam');

    const longNickname = await api()
      .post(`/api/rooms/${code}/join`)
      .send({ nickname: 'x'.repeat(25) });
    expect(longNickname.status).toBe(422);
    const joinError = expectErrorEnvelope(longNickname.body, 'validation_error');
    expect(joinError.details!.map((detail) => detail.path)).toEqual(['nickname']);

    const badDirection = await api()
      .post(`/api/rooms/${code}/members/${memberId}/swipes`)
      .send({ nameId: liam, direction: 'maybe' });
    expect(badDirection.status).toBe(422);
    const swipeError = expectErrorEnvelope(badDirection.body, 'validation_error');
    expect(swipeError.details!.map((detail) => detail.path)).toEqual(['direction']);
  });
});
