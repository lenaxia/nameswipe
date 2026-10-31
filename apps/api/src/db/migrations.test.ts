import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from './client.js';
import { migrateDatabase, migrationsFolder } from './migrate.js';
import { createTestDb, type TestDb } from './testing.js';

let test: TestDb | undefined;
afterEach(() => {
  test?.cleanup();
  test = undefined;
});

const TABLES = ['datasets', 'members', 'name_entries', 'names', 'rooms', 'swipes'];

describe('drizzle-kit migrations', () => {
  it('migrations folder ships with the package', () => {
    expect(migrationsFolder).toMatch(/apps\/api\/drizzle$/);
  });

  it('applies cleanly to a fresh SQLite file', () => {
    test = createTestDb(); // opens a brand-new file and applies all migrations

    const tables = test.db.$client
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all()
      .map((r) => r.name)
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
      const keysIn = (db: typeof a) =>
        db.db.$client
          .prepare('select key from datasets')
          .all()
          .map((r) => r.key);
      expect(keysIn(a)).toEqual(['only-a']);
      expect(keysIn(b)).toEqual([]);
    } finally {
      b.cleanup();
    }
  });

  it('re-running migrateDatabase on an up-to-date database is a no-op', () => {
    test = createTestDb();
    expect(() => migrateDatabase(test.db)).not.toThrow();
  });

  it('openDatabase enforces foreign keys (cascade prerequisite)', () => {
    const db = openDatabase(':memory:');
    try {
      expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      closeDatabase(db);
    }
  });

  it('name_entries DDL carries the unique pair, both checks and cascading FKs', () => {
    test = createTestDb();
    const sql = test.db.$client
      .prepare("select sql from sqlite_master where type = 'table' and name = 'name_entries'")
      .get() as { sql: string };

    expect(sql.sql).toContain("CHECK(\"name_entries\".\"gender\" in ('boy', 'girl', 'neutral'))");
    expect(sql.sql).toContain("\"tier\" in ('popular', 'uncommon', 'rare', 'unranked')");
    expect(sql.sql).toContain('ON DELETE cascade');

    const indexes = test.db.$client
      .prepare(
        "select name, sql from sqlite_master where type = 'index' and tbl_name = 'name_entries'",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(indexes).toContain('name_entries_name_id_dataset_id_unique');
  });
});
