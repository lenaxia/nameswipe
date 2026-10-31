import { afterEach, describe, expect, it } from 'vitest';
import {
  createDataset,
  createMember,
  createName,
  createNameEntry,
  createRoom,
  createSwipe,
  createTestDb,
  resetDb,
  type TestDb,
} from './testing.js';
import * as schema from './schema.js';

let test: TestDb | undefined;
afterEach(() => {
  test?.cleanup();
  test = undefined;
});

describe('createTestDb', () => {
  it('returns a migrated, usable database on a temp path', () => {
    test = createTestDb();
    expect(test.path).toMatch(/nameswipe-test-/);

    const dataset = createDataset(test.db);
    expect(test.db.select().from(schema.datasets).all()).toHaveLength(1);
    expect(dataset.key).toBeTruthy();
  });
});

describe('resetDb', () => {
  it('empties every table without touching the schema', () => {
    test = createTestDb();
    const { db } = test;

    // Seed at least one row in every table.
    const dataset = createDataset(db);
    const name = createName(db);
    createNameEntry(db, { nameId: name.id, datasetId: dataset.id });
    const room = createRoom(db);
    const member = createMember(db, { roomId: room.id });
    createSwipe(db, { memberId: member.id, nameId: name.id });

    resetDb(db);

    expect(db.select().from(schema.datasets).all()).toEqual([]);
    expect(db.select().from(schema.names).all()).toEqual([]);
    expect(db.select().from(schema.nameEntries).all()).toEqual([]);
    expect(db.select().from(schema.rooms).all()).toEqual([]);
    expect(db.select().from(schema.members).all()).toEqual([]);
    expect(db.select().from(schema.swipes).all()).toEqual([]);

    // Schema still works after a reset: rows can be inserted again.
    expect(() => createSwipe(db)).not.toThrow();
    expect(db.select().from(schema.swipes).all()).toHaveLength(1);
  });
});

describe('factories', () => {
  it('generate distinct default values across calls', () => {
    test = createTestDb();
    const { db } = test;

    const first = createName(db);
    const second = createName(db);

    expect(first.id).not.toBe(second.id);
    expect(first.normalizedKey).not.toBe(second.normalizedKey);

    const roomA = createRoom(db);
    const roomB = createRoom(db);
    expect(roomA.code).not.toBe(roomB.code);

    const memberA = createMember(db, { roomId: roomA.id });
    const memberB = createMember(db, { roomId: roomB.id });
    expect(memberA.token).not.toBe(memberB.token);

    const entryA = createNameEntry(db, { nameId: first.id, datasetId: createDataset(db).id });
    const entryB = createNameEntry(db, { nameId: second.id, datasetId: createDataset(db).id });
    expect(entryA.id).not.toBe(entryB.id);

    const swipeA = createSwipe(db, { memberId: memberA.id, nameId: first.id });
    const swipeB = createSwipe(db, { memberId: memberB.id, nameId: second.id });
    expect(swipeA.id).not.toBe(swipeB.id);
  });

  it('honor explicit overrides and skip creating linked rows that were provided', () => {
    test = createTestDb();
    const { db } = test;

    const room = createRoom(db);
    const member = createMember(db, { roomId: room.id, label: 'Zoe', token: 'tok-zoe' });
    expect(member.roomId).toBe(room.id);
    expect(member.label).toBe('Zoe');
    expect(member.token).toBe('tok-zoe');

    // Only one room exists: createMember must not have created another.
    expect(db.select().from(schema.rooms).all()).toHaveLength(1);
  });
});
