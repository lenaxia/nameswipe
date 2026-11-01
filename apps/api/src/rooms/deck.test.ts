import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import { createSwipe, createTestDb, type TestDb } from '../db/testing.js';
import type { ParsedDataset } from '../data/contract.js';
import { loadDataDir } from '../data/loader.js';
import { mergeDatasets } from '../data/merge.js';
import { seedDatabase } from '../data/seed.js';
import { entry, fixtureDataset } from '../data/testkit.js';
import type { RoomConfig } from './config.js';
import { createRoomsRouter } from './router.js';

/**
 * Deck endpoint integration tests.
 *
 * Every test gets its own migrated temp SQLite file and its own app
 * instance. The filter matrix runs against small testkit fixture datasets
 * that isolate exactly one rule each; determinism and payload-shape tests
 * run against the committed data/samples fixtures through the real
 * load -> merge -> seed pipeline.
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

function seedFixtures(datasets: ParsedDataset[]): void {
  const { names } = mergeDatasets(datasets);
  seedDatabase(testDb.db, datasets, names);
}

/** The committed sample fixtures, through the real load/merge/seed pipeline. */
function seedSamples(): void {
  const samplesDir = fileURLToPath(new URL('../../../../data/samples', import.meta.url));
  const { datasets, errors } = loadDataDir(samplesDir);
  expect(errors).toEqual([]);
  seedFixtures(datasets);
}

function openConfig(datasets: string[], extra: Partial<RoomConfig> = {}): RoomConfig {
  return {
    datasets,
    genders: ['boy', 'girl', 'neutral'],
    tiers: ['popular', 'uncommon', 'rare', 'unranked'],
    ...extra,
  };
}

const SAMPLE_KEYS = ['sample-us', 'sample-nordic', 'sample-es'];

interface RoomHandles {
  code: string;
  ada: string;
  belle: string;
}

/** Creates a room through the public API and joins both members. */
async function openRoom(config: RoomConfig): Promise<RoomHandles> {
  const created = await api().post('/api/rooms').send(config);
  expect(created.status).toBe(201);
  const code = created.body.code as string;
  const ada = await api().post(`/api/rooms/${code}/join`).send({ nickname: 'Ada' });
  const belle = await api().post(`/api/rooms/${code}/join`).send({ nickname: 'Belle' });
  expect(ada.status).toBe(201);
  expect(belle.status).toBe(201);
  return { code, ada: ada.body.memberId as string, belle: belle.body.memberId as string };
}

function getDeck(code: string, memberId: string) {
  return api().get(`/api/rooms/${code}/members/${memberId}/deck`);
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

function namesOf(body: unknown): DeckName[] {
  return (body as { names: DeckName[] }).names;
}

function displays(body: unknown): string[] {
  return namesOf(body).map((name) => name.display);
}

function sortedDisplays(body: unknown): string[] {
  return [...displays(body)].sort();
}

function findName(body: unknown, display: string): DeckName {
  const name = namesOf(body).find((candidate) => candidate.display === display);
  expect(name, `expected '${display}' in the deck`).toBeDefined();
  return name!;
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

// -- filter matrix ----------------------------------------------------------------

describe('GET /api/rooms/:code/members/:memberId/deck — filter matrix', () => {
  it('dataset set: only names with an entry in a configured dataset appear', async () => {
    seedFixtures([
      fixtureDataset('ds-a', 10, [entry('Only A'), entry('Both Names')]),
      fixtureDataset('ds-b', 20, [entry('Only B'), entry('Both Names')]),
    ]);

    const first = await openRoom(openConfig(['ds-a']));
    const aDeck = await getDeck(first.code, first.ada);
    expect(aDeck.status).toBe(200);
    expect(sortedDisplays(aDeck.body)).toEqual(['Both Names', 'Only A']);
    // 'Both Names' also exists in ds-b, but the payload lists only the
    // room-configured datasets it appears in.
    expect(findName(aDeck.body, 'Both Names').datasets).toEqual(['ds-a']);

    const both = await openRoom(openConfig(['ds-a', 'ds-b']));
    const bothDeck = await getDeck(both.code, both.ada);
    expect(bothDeck.status).toBe(200);
    expect(sortedDisplays(bothDeck.body)).toEqual(['Both Names', 'Only A', 'Only B']);
    // Merged datasets array, ordered by dataset sort order.
    expect(findName(bothDeck.body, 'Both Names').datasets).toEqual(['ds-a', 'ds-b']);
  });

  it('gender: names.genderTags must intersect room.genders (name-level union tags)', async () => {
    seedFixtures([
      fixtureDataset('g-a', 10, [
        entry('Boy Name', { gender: 'boy' }),
        entry('Girl Name', { gender: 'girl' }),
        entry('Neutral Name', { gender: 'neutral' }),
      ]),
    ]);

    const girls = await openRoom(openConfig(['g-a'], { genders: ['girl'] }));
    const girlDeck = await getDeck(girls.code, girls.ada);
    expect(girlDeck.status).toBe(200);
    expect(sortedDisplays(girlDeck.body)).toEqual(['Girl Name']);

    const boyOrNeutral = await openRoom(openConfig(['g-a'], { genders: ['boy', 'neutral'] }));
    const mixedDeck = await getDeck(boyOrNeutral.code, boyOrNeutral.ada);
    expect(mixedDeck.status).toBe(200);
    expect(sortedDisplays(mixedDeck.body)).toEqual(['Boy Name', 'Neutral Name']);
  });

  it('gender: union tags span datasets — a ds-a boy name tagged neutral via ds-b matches a neutral-only room', async () => {
    seedFixtures([
      fixtureDataset('u-a', 10, [
        entry('Dual Name', { gender: 'boy' }),
        entry('Plain Boy', { gender: 'boy' }),
      ]),
      fixtureDataset('u-b', 20, [entry('Dual Name', { gender: 'neutral' })]),
    ]);

    // Only ds-a is configured, but genderTags is the seeded union [boy, neutral].
    const room = await openRoom(openConfig(['u-a'], { genders: ['neutral'] }));
    const response = await getDeck(room.code, room.ada);

    expect(response.status).toBe(200);
    expect(sortedDisplays(response.body)).toEqual(['Dual Name']);
    expect(findName(response.body, 'Dual Name').genderTags).toEqual(['boy', 'neutral']);
  });

  it('tier: best rank tier across entries must be in room.tiers', async () => {
    seedFixtures([
      fixtureDataset('t-a', 10, [
        entry('Top Name', { popularity_rank: 1 }),
        entry('Mid Name', { popularity_rank: 600 }),
        entry('Low Name', { popularity_rank: 1200 }),
        entry('Curated Rare', { popularity_rank: 2001, tier: 'rare' }),
        entry('No Rank', {}),
      ]),
    ]);

    const popular = await openRoom(openConfig(['t-a'], { tiers: ['popular'] }));
    expect(sortedDisplays((await getDeck(popular.code, popular.ada)).body)).toEqual(['Top Name']);

    const uncommon = await openRoom(openConfig(['t-a'], { tiers: ['uncommon'] }));
    expect(sortedDisplays((await getDeck(uncommon.code, uncommon.ada)).body)).toEqual(['Mid Name']);

    const rare = await openRoom(openConfig(['t-a'], { tiers: ['rare'] }));
    expect(sortedDisplays((await getDeck(rare.code, rare.ada)).body)).toEqual([
      'Curated Rare',
      'Low Name',
    ]);

    const unranked = await openRoom(openConfig(['t-a'], { tiers: ['unranked'] }));
    expect(sortedDisplays((await getDeck(unranked.code, unranked.ada)).body)).toEqual(['No Rank']);
  });

  it('tier: a name whose best entry is popular qualifies even when another entry is unranked', async () => {
    seedFixtures([
      fixtureDataset('climb-a', 10, [entry('Climber', { popularity_rank: 600 })]),
      fixtureDataset('climb-b', 20, [entry('Climber', { popularity_rank: 93 })]),
    ]);

    const room = await openRoom(openConfig(['climb-a', 'climb-b'], { tiers: ['popular'] }));
    const response = await getDeck(room.code, room.ada);

    expect(response.status).toBe(200);
    const climber = findName(response.body, 'Climber');
    expect(climber.tier).toBe('popular');
    expect(climber.datasets).toEqual(['climb-a', 'climb-b']);
  });

  it('origin: a configured origin matches when ANY entry carries it exactly', async () => {
    seedFixtures([
      fixtureDataset('o-a', 10, [
        entry('Norse Name', { origin: 'Old Norse' }),
        entry('Hebrew Name', { origin: 'Hebrew' }),
        entry('No Origin', {}),
        entry('Latin Norse', { origin: 'Latin' }),
      ]),
      fixtureDataset('o-b', 20, [entry('Latin Norse', { origin: 'Old Norse' })]),
    ]);

    const norse = await openRoom(openConfig(['o-a', 'o-b'], { origins: ['Old Norse'] }));
    const norseDeck = await getDeck(norse.code, norse.ada);
    expect(norseDeck.status).toBe(200);
    // 'Latin Norse' qualifies via its ds-b entry even though ds-a says Latin.
    expect(sortedDisplays(norseDeck.body)).toEqual(['Latin Norse', 'Norse Name']);
    // Passthrough origin is the first non-null in dataset order (ds-a wins).
    expect(findName(norseDeck.body, 'Latin Norse').origin).toBe('Latin');

    const both = await openRoom(openConfig(['o-a', 'o-b'], { origins: ['Old Norse', 'Hebrew'] }));
    expect(sortedDisplays((await getDeck(both.code, both.ada)).body)).toEqual([
      'Hebrew Name',
      'Latin Norse',
      'Norse Name',
    ]);
  });

  it('firstLetters: display[0] compared case-insensitively against the configured letters', async () => {
    seedFixtures([
      fixtureDataset('l-a', 10, [
        entry('Alice', { gender: 'girl' }),
        entry('BOB', { gender: 'boy' }),
        entry('Cara', { gender: 'girl' }),
      ]),
    ]);

    const aOnly = await openRoom(openConfig(['l-a'], { firstLetters: ['a'] }));
    expect(sortedDisplays((await getDeck(aOnly.code, aOnly.ada)).body)).toEqual(['Alice']);

    const bOnly = await openRoom(openConfig(['l-a'], { firstLetters: ['b'] }));
    expect(sortedDisplays((await getDeck(bOnly.code, bOnly.ada)).body)).toEqual(['BOB']);

    const ac = await openRoom(openConfig(['l-a'], { firstLetters: ['a', 'c'] }));
    expect(sortedDisplays((await getDeck(ac.code, ac.ada)).body)).toEqual(['Alice', 'Cara']);

    const unfiltered = await openRoom(openConfig(['l-a']));
    expect(sortedDisplays((await getDeck(unfiltered.code, unfiltered.ada)).body)).toEqual([
      'Alice',
      'BOB',
      'Cara',
    ]);
  });

  it('a room whose filters exclude everything returns an empty names array', async () => {
    seedFixtures([fixtureDataset('e-a', 10, [entry('Girl One', { gender: 'girl' })])]);

    const room = await openRoom(openConfig(['e-a'], { genders: ['boy'] }));
    const response = await getDeck(room.code, room.ada);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ names: [] });
  });
});

// -- swipe exclusion -----------------------------------------------------------------

describe('GET /api/rooms/:code/members/:memberId/deck — swipe exclusion', () => {
  function memberRow(token: string): schema.Member {
    const row = testDb.db
      .select()
      .from(schema.members)
      .where(eq(schema.members.token, token))
      .get();
    expect(row, 'member fixture row').toBeDefined();
    return row!;
  }

  it("excludes only THIS member's swipes; survivors keep their relative order (no reshuffle)", async () => {
    seedFixtures([
      fixtureDataset('sw-a', 10, [
        entry('Name One', { gender: 'girl' }),
        entry('Name Two', { gender: 'girl' }),
        entry('Name Three', { gender: 'girl' }),
        entry('Name Four', { gender: 'girl' }),
        entry('Name Five', { gender: 'girl' }),
      ]),
    ]);
    const room = await openRoom(openConfig(['sw-a']));

    const before = await getDeck(room.code, room.ada);
    expect(before.status).toBe(200);
    const beforeIds = namesOf(before.body).map((name) => name.nameId);
    expect(beforeIds).toHaveLength(5);

    const partnerBefore = await getDeck(room.code, room.belle);
    expect(partnerBefore.status).toBe(200);

    // Ada swipes (direct db insert — the swipes API is a later story).
    const ada = memberRow(room.ada);
    const [swipedOne, swipedTwo] = beforeIds;
    createSwipe(testDb.db, { memberId: ada.id, nameId: swipedOne, direction: 'like' });
    createSwipe(testDb.db, { memberId: ada.id, nameId: swipedTwo, direction: 'dislike' });

    const after = await getDeck(room.code, room.ada);
    expect(after.status).toBe(200);
    const afterIds = namesOf(after.body).map((name) => name.nameId);
    // The three survivors are the exact subsequence of the previous order.
    expect(afterIds).toEqual(beforeIds.filter((id) => id !== swipedOne && id !== swipedTwo));

    // Belle swiped nothing: her deck is unchanged and still holds every name.
    const partnerAfter = await getDeck(room.code, room.belle);
    expect(partnerAfter.status).toBe(200);
    expect(partnerAfter.body).toEqual(partnerBefore.body);
    expect(namesOf(partnerAfter.body).map((name) => name.nameId)).toContain(swipedOne);
    expect(namesOf(partnerAfter.body).map((name) => name.nameId)).toContain(swipedTwo);
  });
});

// -- determinism ---------------------------------------------------------------------

describe('GET /api/rooms/:code/members/:memberId/deck — determinism', () => {
  it('same member: identical deck across repeated calls; other member: different order', async () => {
    seedSamples();
    const room = await openRoom(openConfig(SAMPLE_KEYS));

    const first = await getDeck(room.code, room.ada);
    const second = await getDeck(room.code, room.ada);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(namesOf(first.body)).toHaveLength(16);

    const partner = await getDeck(room.code, room.belle);
    expect(partner.status).toBe(200);
    const adaIds = namesOf(first.body).map((name) => name.nameId);
    const belleIds = namesOf(partner.body).map((name) => name.nameId);
    // Same 16 names, independently shuffled (different seed material).
    expect([...belleIds].sort()).toEqual([...adaIds].sort());
    expect(belleIds).not.toEqual(adaIds);
  });
});

// -- payload shape -------------------------------------------------------------------

describe('GET /api/rooms/:code/members/:memberId/deck — payload shape', () => {
  it('every item carries the required fields with valid values (data/samples)', async () => {
    seedSamples();
    const room = await openRoom(openConfig(SAMPLE_KEYS));

    const response = await getDeck(room.code, room.ada);
    expect(response.status).toBe(200);

    const deck = namesOf(response.body);
    expect(deck).toHaveLength(16);
    for (const name of deck) {
      expect(typeof name.nameId).toBe('number');
      expect(typeof name.display).toBe('string');
      expect(name.display).not.toBe('');
      expect(name.genderTags.length).toBeGreaterThan(0);
      for (const tag of name.genderTags) {
        expect(['boy', 'girl', 'neutral']).toContain(tag);
      }
      expect(name.datasets.length).toBeGreaterThan(0);
      for (const key of name.datasets) {
        expect(SAMPLE_KEYS).toContain(key);
      }
      expect(['popular', 'uncommon', 'rare', 'unranked']).toContain(name.tier);
      for (const field of ['romanization', 'meaning', 'origin'] as const) {
        if (field in name) {
          expect(typeof name[field]).toBe('string');
          expect(name[field]).not.toBe('');
        }
      }
    }
  });

  it('merged sample names expose the merged view: datasets, best tier, first non-null passthrough', async () => {
    seedSamples();
    const room = await openRoom(openConfig(SAMPLE_KEYS));

    const response = await getDeck(room.code, room.ada);
    expect(response.status).toBe(200);

    // Kai: boy @ rank 93 in sample-us + neutral unranked in sample-nordic.
    const kai = findName(response.body, 'Kai');
    expect(kai.genderTags).toEqual(['boy', 'neutral']);
    expect(kai.datasets).toEqual(['sample-us', 'sample-nordic']);
    expect(kai.tier).toBe('popular');
    expect(kai.meaning).toBe('variously sea, victory, or fire across Nordic languages');
    expect('romanization' in kai).toBe(false);
    expect('origin' in kai).toBe(false);

    // Jose: spelling tie broken by lowest sort_order; origins pass through.
    const jose = findName(response.body, 'Jose');
    expect(jose.display).toBe('Jose');
    expect(jose.datasets).toEqual(['sample-us', 'sample-es']);
    expect(jose.tier).toBe('popular');
    expect(jose.origin).toBe('Hebrew, via Joseph');
    expect(jose.meaning).toBe('God will add');

    // Astrid: rank 600 -> uncommon band.
    expect(findName(response.body, 'Astrid').tier).toBe('uncommon');
  });

  it('romanization passes through when curated, falling forward across datasets', async () => {
    seedFixtures([
      fixtureDataset('r-a', 10, [
        entry('Mei', {
          gender: 'girl',
          romanization: 'méi',
          meaning: 'beautiful',
          origin: 'Chinese',
        }),
        entry('Li', { gender: 'girl', romanization: 'lǐ' }),
      ]),
      fixtureDataset('r-b', 20, [entry('Nadia', { gender: 'girl' })]),
      fixtureDataset('r-c', 30, [entry('Nadia', { gender: 'girl', romanization: 'nadiya' })]),
    ]);
    const room = await openRoom(openConfig(['r-a', 'r-b', 'r-c']));

    const response = await getDeck(room.code, room.ada);
    expect(response.status).toBe(200);

    const mei = findName(response.body, 'Mei');
    expect(mei.romanization).toBe('méi');
    expect(mei.meaning).toBe('beautiful');
    expect(mei.origin).toBe('Chinese');

    const li = findName(response.body, 'Li');
    expect(li.romanization).toBe('lǐ');
    expect('meaning' in li).toBe(false);
    expect('origin' in li).toBe(false);

    // Nadia: r-b (sort 20) has no romanization, so pickFirst falls forward to r-c.
    const nadia = findName(response.body, 'Nadia');
    expect(nadia.romanization).toBe('nadiya');
    expect(nadia.datasets).toEqual(['r-b', 'r-c']);
  });
});

// -- error contract -------------------------------------------------------------------

describe('GET /api/rooms/:code/members/:memberId/deck — error contract', () => {
  it('renders 404 room_not_found for an unknown code', async () => {
    seedFixtures([fixtureDataset('x-a', 10, [entry('X Name')])]);
    const response = await getDeck('ZZZZZ9', '00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
    expectUnifiedError(response.body, 'room_not_found');
  });

  it('renders 404 member_not_found for an unknown memberId in a valid room', async () => {
    seedFixtures([fixtureDataset('x-a', 10, [entry('X Name')])]);
    const room = await openRoom(openConfig(['x-a']));
    const stranger = '11111111-2222-3333-4444-555555555555';

    const response = await getDeck(room.code, stranger);

    expect(response.status).toBe(404);
    const error = expectUnifiedError(response.body, 'member_not_found');
    expect(error.message).toContain(stranger);
  });

  it('renders 404 member_not_found for a member of a DIFFERENT room (not in this room)', async () => {
    seedFixtures([
      fixtureDataset('x-a', 10, [entry('X Name')]),
      fixtureDataset('x-b', 20, [entry('Y Name')]),
    ]);
    const mine = await openRoom(openConfig(['x-a']));
    const other = await openRoom(openConfig(['x-b']));

    const response = await getDeck(mine.code, other.ada);

    expect(response.status).toBe(404);
    expectUnifiedError(response.body, 'member_not_found');
  });

  it('renders 404 member_not_found for a memberId that is not a token at all', async () => {
    seedFixtures([fixtureDataset('x-a', 10, [entry('X Name')])]);
    const room = await openRoom(openConfig(['x-a']));

    const response = await getDeck(room.code, 'definitely-not-a-token');

    expect(response.status).toBe(404);
    expectUnifiedError(response.body, 'member_not_found');
  });

  it('renders 400 validation_error for a code outside the pairing alphabet', async () => {
    const response = await getDeck('abc123', '00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(400);
    const error = expectUnifiedError(response.body, 'validation_error');
    expect(error.details!.map((detail) => detail.path)).toContain('code');
  });
});
