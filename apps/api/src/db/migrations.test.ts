import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, type Db } from './client.js';
import { migrateDatabase, migrationsFolder } from './migrate.js';
import { createTestDb, type TestDb } from './testing.js';

let test: TestDb | undefined;
afterEach(() => {
  test?.cleanup();
  test = undefined;
});

const TABLES = ['datasets', 'members', 'name_entries', 'names', 'rooms', 'swipes'];

function rows(db: Db, sql: string): Array<Record<string, unknown>> {
  return db.$client.prepare(sql).all() as Array<Record<string, unknown>>;
}

describe('drizzle-kit migrations', () => {
  it('migrations folder ships with the package', () => {
    expect(migrationsFolder).toMatch(/apps\/api\/drizzle$/);
  });

  it('applies cleanly to a fresh SQLite file', () => {
    test = createTestDb(); // opens a brand-new file and applies all migrations

    const tables = rows(
      test.db,
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
    )
      .map((r) => r.name as string)
      .filter((name) => !name.startsWith('__drizzle'))
      .sort();

    expect(tables).toEqual(TABLES);
  });

  it('createTestDb gives every call its own database file', () => {
    const a = createTestDb();
    const b = createTestDb();
    test = a;
    try {
      expect(a.path).not.toBe(b.path);

      // Rows are only ever visible to the database they were written to.
      a.db.$client
        .prepare(
          "insert into datasets (key, name, description, sort_order) values ('only-a', 'A', 'x', 1)",
        )
        .run();
      const keysIn = (db: Db) => rows(db, 'select key from datasets').map((r) => r.key as string);
      expect(keysIn(a.db)).toEqual(['only-a']);
      expect(keysIn(b.db)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it('re-running migrateDatabase on an up-to-date database is a no-op', () => {
    const fresh = createTestDb();
    test = fresh;
    expect(() => migrateDatabase(fresh.db)).not.toThrow();
  });

  it('openDatabase enforces foreign keys (cascade prerequisite)', () => {
    const db = openDatabase(':memory:');
    try {
      expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      closeDatabase(db);
    }
  });

  it('name_entries DDL carries both checks and cascading FKs', () => {
    test = createTestDb();
    const ddl = rows(
      test.db,
      "select sql from sqlite_master where type = 'table' and name = 'name_entries'",
    )[0]!.sql as string;

    expect(ddl).toContain("CHECK(\"name_entries\".\"gender\" in ('boy', 'girl', 'neutral'))");
    expect(ddl).toContain("\"tier\" in ('popular', 'uncommon', 'rare', 'unranked')");
    expect(ddl).toContain('ON DELETE cascade');

    const indexes = rows(
      test.db,
      "select name from sqlite_master where type = 'index' and tbl_name = 'name_entries'",
    ).map((r) => r.name as string);
    expect(indexes).toContain('name_entries_name_id_dataset_id_unique');
  });
});
