import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDataset,
  createMember,
  createName,
  createRoom,
  createTestDb,
  type TestDb,
} from './testing.js';
import * as schema from './schema.js';

let test: TestDb | undefined;
afterEach(() => {
  test?.cleanup();
  test = undefined;
});

const START = Date.now();

/** created_at columns default to "now" at insert time (DDL default). */
function expectFreshTimestamp(value: Date | null): void {
  expect(value).toBeInstanceOf(Date);
  expect(value!.getTime()).toBeGreaterThanOrEqual(START);
  expect(value!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
}

describe('schema v1 round-trips (insert -> read, every field asserted)', () => {
  it('datasets', () => {
    test = createTestDb();
    const { db } = test;

    const inserted = db
      .insert(schema.datasets)
      .values({
        key: 'us-top-1000',
        name: 'US Top 1000',
        description: 'Most popular US baby names',
        sortOrder: 3,
      })
      .returning()
      .get();

    const row = db.select().from(schema.datasets).where(eq(schema.datasets.id, inserted.id)).get();

    expect(row).toEqual({
      id: inserted.id,
      key: 'us-top-1000',
      name: 'US Top 1000',
      description: 'Most popular US baby names',
      sortOrder: 3,
    });
  });

  it('names (including json gender_tags and created_at default)', () => {
    test = createTestDb();
    const { db } = test;

    const inserted = db
      .insert(schema.names)
      .values({
        normalizedKey: 'emma',
        display: 'Emma',
        genderTags: ['feminine', 'classic'],
      })
      .returning()
      .get();

    const row = db.select().from(schema.names).where(eq(schema.names.id, inserted.id)).get();

    expect(row).toEqual({
      id: inserted.id,
      normalizedKey: 'emma',
      display: 'Emma',
      genderTags: ['feminine', 'classic'],
      createdAt: inserted.createdAt,
    });
    expectFreshTimestamp(row?.createdAt ?? null);
  });

  it('names (json default is an empty array)', () => {
    test = createTestDb();
    const { db } = test;

    const row = db
      .insert(schema.names)
      .values({ normalizedKey: 'kai', display: 'Kai' })
      .returning()
      .get();

    expect(row.genderTags).toEqual([]);
  });

  it('name_entries (every field set)', () => {
    test = createTestDb();
    const { db } = test;
    const name = createName(db);
    const dataset = createDataset(db);

    const inserted = db
      .insert(schema.nameEntries)
      .values({
        nameId: name.id,
        datasetId: dataset.id,
        gender: 'boy',
        popularityRank: 12,
        tier: 'popular',
        romanization: 'HAO',
        origin: 'Chinese',
        meaning: 'good, great',
      })
      .returning()
      .get();

    const row = db
      .select()
      .from(schema.nameEntries)
      .where(eq(schema.nameEntries.id, inserted.id))
      .get();

    expect(row).toEqual({
      id: inserted.id,
      nameId: name.id,
      datasetId: dataset.id,
      gender: 'boy',
      popularityRank: 12,
      tier: 'popular',
      romanization: 'HAO',
      origin: 'Chinese',
      meaning: 'good, great',
    });
  });

  it('name_entries (optional fields default to null)', () => {
    test = createTestDb();
    const { db } = test;
    const name = createName(db);
    const dataset = createDataset(db);

    const row = db
      .insert(schema.nameEntries)
      .values({ nameId: name.id, datasetId: dataset.id, gender: 'neutral' })
      .returning()
      .get();

    expect(row).toEqual({
      id: row.id,
      nameId: name.id,
      datasetId: dataset.id,
      gender: 'neutral',
      popularityRank: null,
      tier: null,
      romanization: null,
      origin: null,
      meaning: null,
    });
  });

  it('rooms (including json settings and created_at default)', () => {
    test = createTestDb();
    const { db } = test;

    const inserted = db
      .insert(schema.rooms)
      .values({
        code: 'XD4K2A',
        settings: { batchSize: 30, theme: 'hearts' },
      })
      .returning()
      .get();

    const row = db.select().from(schema.rooms).where(eq(schema.rooms.id, inserted.id)).get();

    expect(row).toEqual({
      id: inserted.id,
      code: 'XD4K2A',
      settings: { batchSize: 30, theme: 'hearts' },
      createdAt: inserted.createdAt,
    });
    expectFreshTimestamp(row?.createdAt ?? null);
  });

  it('rooms (json default is an empty object)', () => {
    test = createTestDb();
    const { db } = test;

    const row = db.insert(schema.rooms).values({ code: 'AA11BB' }).returning().get();

    expect(row.settings).toEqual({});
  });

  it('members', () => {
    test = createTestDb();
    const { db } = test;
    const room = createRoom(db);

    const inserted = db
      .insert(schema.members)
      .values({ roomId: room.id, label: 'Alice', token: 'tok-alice-1' })
      .returning()
      .get();

    const row = db.select().from(schema.members).where(eq(schema.members.id, inserted.id)).get();

    expect(row).toEqual({
      id: inserted.id,
      roomId: room.id,
      label: 'Alice',
      token: 'tok-alice-1',
      createdAt: inserted.createdAt,
    });
    expectFreshTimestamp(row?.createdAt ?? null);
  });

  it('swipes', () => {
    test = createTestDb();
    const { db } = test;
    const member = createMember(db, { label: 'Bob' });
    const name = createName(db, { normalizedKey: 'arwen', display: 'Arwen' });

    const inserted = db
      .insert(schema.swipes)
      .values({ memberId: member.id, nameId: name.id, direction: 'dislike' })
      .returning()
      .get();

    const row = db.select().from(schema.swipes).where(eq(schema.swipes.id, inserted.id)).get();

    expect(row).toEqual({
      id: inserted.id,
      memberId: member.id,
      nameId: name.id,
      direction: 'dislike',
      createdAt: inserted.createdAt,
    });
    expectFreshTimestamp(row?.createdAt ?? null);
  });
});
