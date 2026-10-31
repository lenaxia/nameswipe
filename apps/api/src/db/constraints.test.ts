import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDataset,
  createMember,
  createName,
  createNameEntry,
  createRoom,
  createSwipe,
  createTestDb,
  type TestDb,
} from './testing.js';
import * as schema from './schema.js';

let test: TestDb | undefined;
afterEach(() => {
  test?.cleanup();
  test = undefined;
});

describe('unique constraints', () => {
  it('datasets.key rejects duplicates', () => {
    test = createTestDb();
    createDataset(test.db, { key: 'dup-key' });

    expect(() =>
      test!.db
        .insert(schema.datasets)
        .values({ key: 'dup-key', name: 'Other', description: 'd', sortOrder: 2 })
        .run(),
    ).toThrowError(/UNIQUE constraint failed: datasets\.key/);
  });

  it('names.normalized_key rejects duplicates', () => {
    test = createTestDb();
    createName(test.db, { normalizedKey: 'emma' });

    expect(() =>
      test!.db.insert(schema.names).values({ normalizedKey: 'emma', display: 'Emma 2' }).run(),
    ).toThrowError(/UNIQUE constraint failed: names\.normalized_key/);
  });

  it('name_entries rejects the same (name_id, dataset_id) pair twice', () => {
    test = createTestDb();
    const entry = createNameEntry(test.db);

    expect(() =>
      test!.db
        .insert(schema.nameEntries)
        .values({ nameId: entry.nameId, datasetId: entry.datasetId, gender: 'girl' })
        .run(),
    ).toThrowError(/UNIQUE constraint failed: name_entries/);
  });

  it('name_entries allows the same name in two datasets and two names in one dataset', () => {
    test = createTestDb();
    const { db } = test;
    const name = createName(db);
    const datasetA = createDataset(db);
    const datasetB = createDataset(db);

    db.insert(schema.nameEntries)
      .values([
        { nameId: name.id, datasetId: datasetA.id, gender: 'neutral' },
        { nameId: name.id, datasetId: datasetB.id, gender: 'neutral' },
      ])
      .run();
    createNameEntry(db, { datasetId: datasetA.id });

    expect(db.select().from(schema.nameEntries).all()).toHaveLength(3);
  });

  it('members.token rejects duplicates', () => {
    test = createTestDb();
    createMember(test.db, { token: 'tok-dup' });

    expect(() =>
      test!.db
        .insert(schema.members)
        .values({
          roomId: createRoom(test!.db).id,
          label: 'Copy',
          token: 'tok-dup',
        })
        .run(),
    ).toThrowError(/UNIQUE constraint failed: members\.token/);
  });

  it('swipes rejects the same (member_id, name_id) pair twice', () => {
    test = createTestDb();
    const swipe = createSwipe(test.db);

    expect(() =>
      test!.db
        .insert(schema.swipes)
        .values({
          memberId: swipe.memberId,
          nameId: swipe.nameId,
          direction: 'dislike',
        })
        .run(),
    ).toThrowError(/UNIQUE constraint failed: swipes/);
  });
});

describe('check constraints', () => {
  it('name_entries.gender only accepts boy/girl/neutral', () => {
    test = createTestDb();
    const { db } = test;

    for (const gender of ['boy', 'girl', 'neutral']) {
      createNameEntry(db, { gender });
    }

    expect(() => createNameEntry(test!.db, { gender: 'both' })).toThrowError(
      /CHECK constraint failed: name_entries_gender_check/,
    );
  });

  it('name_entries.tier only accepts popular/uncommon/rare/unranked (null allowed)', () => {
    test = createTestDb();
    const { db } = test;

    for (const tier of ['popular', 'uncommon', 'rare', 'unranked', null]) {
      createNameEntry(db, { tier });
    }

    expect(() => createNameEntry(test!.db, { tier: 'legendary' })).toThrowError(
      /CHECK constraint failed: name_entries_tier_check/,
    );
  });

  it('swipes.direction only accepts like/dislike', () => {
    test = createTestDb();
    createSwipe(test.db, { direction: 'like' });
    createSwipe(test.db, { direction: 'dislike' });

    expect(() => createSwipe(test!.db, { direction: 'superlike' })).toThrowError(
      /CHECK constraint failed: swipes_direction_check/,
    );
  });
});

describe('foreign key cascades', () => {
  it('deleting a room cascades to its members and their swipes', () => {
    test = createTestDb();
    const { db } = test;
    const room = createRoom(db);
    const memberA = createMember(db, { roomId: room.id, label: 'A' });
    const memberB = createMember(db, { roomId: room.id, label: 'B' });
    createSwipe(db, { memberId: memberA.id });
    createSwipe(db, { memberId: memberB.id, direction: 'dislike' });
    // Control rows belonging to another room must survive.
    const otherRoom = createRoom(db);
    const otherMember = createMember(db, { roomId: otherRoom.id });
    const otherSwipe = createSwipe(db, { memberId: otherMember.id });

    db.delete(schema.rooms).where(eq(schema.rooms.id, room.id)).run();

    expect(
      db
        .select()
        .from(schema.rooms)
        .all()
        .map((r) => r.id),
    ).toEqual([otherRoom.id]);
    expect(
      db
        .select()
        .from(schema.members)
        .all()
        .map((m) => m.id),
    ).toEqual([otherMember.id]);
    expect(
      db
        .select()
        .from(schema.swipes)
        .all()
        .map((s) => s.id),
    ).toEqual([otherSwipe.id]);
  });

  it('deleting a name cascades to its name_entries and swipes', () => {
    test = createTestDb();
    const { db } = test;
    const name = createName(db);
    createNameEntry(db, { nameId: name.id });
    createSwipe(db, { nameId: name.id });
    // Control rows attached to another name must survive.
    const otherName = createName(db);
    const otherEntry = createNameEntry(db, { nameId: otherName.id });
    const otherSwipe = createSwipe(db, { nameId: otherName.id });

    db.delete(schema.names).where(eq(schema.names.id, name.id)).run();

    expect(
      db
        .select()
        .from(schema.names)
        .all()
        .map((n) => n.id),
    ).toEqual([otherName.id]);
    expect(
      db
        .select()
        .from(schema.nameEntries)
        .all()
        .map((e) => e.id),
    ).toEqual([otherEntry.id]);
    expect(
      db
        .select()
        .from(schema.swipes)
        .all()
        .map((s) => s.id),
    ).toEqual([otherSwipe.id]);
  });

  it('deleting a member cascades to their swipes', () => {
    test = createTestDb();
    const { db } = test;
    const member = createMember(db);
    createSwipe(db, { memberId: member.id });
    const otherMember = createMember(db);
    const otherSwipe = createSwipe(db, { memberId: otherMember.id });

    db.delete(schema.members).where(eq(schema.members.id, member.id)).run();

    expect(
      db
        .select()
        .from(schema.members)
        .all()
        .map((m) => m.id),
    ).toEqual([otherMember.id]);
    expect(
      db
        .select()
        .from(schema.swipes)
        .all()
        .map((s) => s.id),
    ).toEqual([otherSwipe.id]);
  });

  it('deleting a dataset cascades to its name_entries', () => {
    test = createTestDb();
    const { db } = test;
    const dataset = createDataset(db);
    createNameEntry(db, { datasetId: dataset.id });
    const otherDataset = createDataset(db);
    const otherEntry = createNameEntry(db, { datasetId: otherDataset.id });

    db.delete(schema.datasets).where(eq(schema.datasets.id, dataset.id)).run();

    expect(
      db
        .select()
        .from(schema.datasets)
        .all()
        .map((d) => d.id),
    ).toEqual([otherDataset.id]);
    expect(
      db
        .select()
        .from(schema.nameEntries)
        .all()
        .map((e) => e.id),
    ).toEqual([otherEntry.id]);
  });

  it('rows left behind by cascades keep referential integrity', () => {
    test = createTestDb();
    const { db } = test;
    const room = createRoom(db);
    const member = createMember(db, { roomId: room.id });
    createSwipe(db, { memberId: member.id });

    db.delete(schema.rooms).where(eq(schema.rooms.id, room.id)).run();

    const violations = db.$client.prepare('pragma foreign_key_check').all();
    expect(violations).toEqual([]);
  });
});
