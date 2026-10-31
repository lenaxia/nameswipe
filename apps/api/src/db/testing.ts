import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, openDatabase, type Db } from './client.js';
import { migrateDatabase } from './migrate.js';
import * as schema from './schema.js';

export type TestDb = {
  db: Db;
  /** Absolute path of the backing SQLite file (unique per call). */
  path: string;
  /** Closes the connection and deletes the temporary directory. */
  cleanup: () => void;
};

let seq = 0;

/**
 * Creates a fully migrated SQLite database in a fresh temp directory.
 * Every call gets its own file, so concurrent test files (or tests within a
 * file) can never observe each other's rows.
 */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'nameswipe-test-'));
  const path = join(dir, 'test.db');
  const db = openDatabase(path);
  migrateDatabase(db);
  return {
    db,
    path,
    cleanup: () => {
      closeDatabase(db);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Deletes all rows from every table (children first). The schema itself and
 * autoincrement sequences are preserved.
 */
export function resetDb(db: Db): void {
  db.delete(schema.swipes).run();
  db.delete(schema.members).run();
  db.delete(schema.rooms).run();
  db.delete(schema.nameEntries).run();
  db.delete(schema.names).run();
  db.delete(schema.datasets).run();
}

/** Unique suffix shared by all factory defaults. */
function next(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function createDataset(db: Db, overrides: Partial<schema.NewDataset> = {}): schema.Dataset {
  return db
    .insert(schema.datasets)
    .values({
      key: next('dataset'),
      name: 'Test Dataset',
      description: 'A dataset created by a factory',
      sortOrder: seq,
      ...overrides,
    })
    .returning()
    .get();
}

export function createName(db: Db, overrides: Partial<schema.NewName> = {}): schema.Name {
  return db
    .insert(schema.names)
    .values({
      normalizedKey: next('name'),
      display: `Name ${seq}`,
      ...overrides,
    })
    .returning()
    .get();
}

export function createNameEntry(
  db: Db,
  overrides: Partial<schema.NewNameEntry> = {},
): schema.NameEntry {
  return db
    .insert(schema.nameEntries)
    .values({
      nameId: overrides.nameId ?? createName(db).id,
      datasetId: overrides.datasetId ?? createDataset(db).id,
      gender: 'neutral',
      ...overrides,
    })
    .returning()
    .get();
}

export function createRoom(db: Db, overrides: Partial<schema.NewRoom> = {}): schema.Room {
  return db
    .insert(schema.rooms)
    .values({
      code: next('room'),
      ...overrides,
    })
    .returning()
    .get();
}

export function createMember(db: Db, overrides: Partial<schema.NewMember> = {}): schema.Member {
  return db
    .insert(schema.members)
    .values({
      roomId: overrides.roomId ?? createRoom(db).id,
      label: `Member ${seq + 1}`,
      token: next('token'),
      ...overrides,
    })
    .returning()
    .get();
}

export function createSwipe(db: Db, overrides: Partial<schema.NewSwipe> = {}): schema.Swipe {
  return db
    .insert(schema.swipes)
    .values({
      memberId: overrides.memberId ?? createMember(db).id,
      nameId: overrides.nameId ?? createName(db).id,
      direction: 'like',
      ...overrides,
    })
    .returning()
    .get();
}
