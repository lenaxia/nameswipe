import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../db/testing.js';
import * as schema from '../db/schema.js';
import { mergeDatasets, type MergeResult } from './merge.js';
import { seedDatabase } from './seed.js';
import { entry, fixtureDataset, makeDataDir, writeDatasetDir } from './testkit.js';
import { validateDataDir } from './validate.js';
import { loadDataDir } from './loader.js';

/**
 * Idempotency contract:
 *   - seeding twice without reset leaves identical table contents, no duplicates
 *   - --reset from empty produces the same state as a plain seed from empty
 */

function fixtureDatasets() {
  return [
    fixtureDataset('us-popular', 10, [
      entry('Kai', { gender: 'boy', popularity_rank: 93 }),
      entry('Jose', { gender: 'boy', popularity_rank: 96 }),
      entry('Sofia', { gender: 'girl', popularity_rank: 15 }),
      entry('Liam', { gender: 'boy', popularity_rank: 1, meaning: 'resolute protector' }),
    ]),
    fixtureDataset('nordic', 20, [
      entry('Kai', { gender: 'neutral', meaning: 'sea, victory, or fire' }),
      entry('Åsa', { gender: 'girl', meaning: 'goddess' }),
      entry('Björn', { gender: 'boy', popularity_rank: 750 }),
    ]),
    fixtureDataset('es-popular', 30, [
      entry('José', { gender: 'boy', tier: 'popular' }),
      entry('Sofía', { gender: 'girl', popularity_rank: 60, meaning: 'wisdom' }),
      entry('Lucía', { gender: 'girl', meaning: 'light' }),
    ]),
  ];
}

/** Everything the seeder writes, in a stable order, for whole-state comparison. */
function snapshot(db: TestDb['db']) {
  const datasets = db.select().from(schema.datasets).orderBy(schema.datasets.key).all();
  const names = db.select().from(schema.names).orderBy(schema.names.normalizedKey).all();
  const nameEntries = db
    .select()
    .from(schema.nameEntries)
    .orderBy(schema.nameEntries.nameId, schema.nameEntries.datasetId)
    .all();
  return { datasets, names, nameEntries };
}

function counts(db: TestDb['db']) {
  const s = snapshot(db);
  return { datasets: s.datasets.length, names: s.names.length, nameEntries: s.nameEntries.length };
}

/** createdAt is insert-time metadata; two databases seeded at different
 * instants are still "the same state" for every authored column. */
function stripCreatedAt(s: ReturnType<typeof snapshot>) {
  return {
    ...s,
    names: s.names.map((n) => {
      const copy: Partial<typeof n> = { ...n };
      delete copy.createdAt;
      return copy;
    }),
  };
}

describe('seedDatabase idempotency', () => {
  it('seeding twice without reset leaves identical table contents and no duplicates', () => {
    const tdb = createTestDb();
    try {
      const datasets = fixtureDatasets();
      const merged = mergeDatasets(datasets);

      const first = seedDatabase(tdb.db, datasets, merged.names);
      const firstSnapshot = snapshot(tdb.db);

      const second = seedDatabase(tdb.db, datasets, merged.names);
      expect(second).toEqual(first);
      expect(snapshot(tdb.db)).toEqual(firstSnapshot);

      // no duplicates: normalized keys and (name, dataset) pairs are unique
      const keys = snapshot(tdb.db).names.map((n) => n.normalizedKey);
      expect(new Set(keys).size).toBe(keys.length);
      const pairs = snapshot(tdb.db).nameEntries.map((e) => `${e.nameId}:${e.datasetId}`);
      expect(new Set(pairs).size).toBe(pairs.length);

      // 10 entries → 8 canonical names (kai, jose, sofia merged across datasets)
      expect(first).toEqual({ datasets: 3, names: 7, nameEntries: 10 });
    } finally {
      tdb.cleanup();
    }
  });

  it('reset from empty produces the same state as a plain seed from empty', () => {
    const plain = createTestDb();
    const reset = createTestDb();
    try {
      const datasets = fixtureDatasets();
      const merged = mergeDatasets(datasets);

      seedDatabase(plain.db, datasets, merged.names);
      seedDatabase(reset.db, datasets, merged.names, { reset: true });

      // createdAt instants legitimately differ between two fresh databases
      expect(stripCreatedAt(snapshot(reset.db))).toEqual(stripCreatedAt(snapshot(plain.db)));
    } finally {
      plain.cleanup();
      reset.cleanup();
    }
  });

  it('reset after a prior seed replaces stale rows instead of accumulating', () => {
    const tdb = createTestDb();
    try {
      const before = fixtureDatasets();
      seedDatabase(tdb.db, before, mergeDatasets(before).names);

      const after = before.slice(0, 2); // es-popular removed
      const countsAfterReset = seedDatabase(tdb.db, after, mergeDatasets(after).names, {
        reset: true,
      });

      expect(countsAfterReset).toEqual({
        datasets: 2,
        names: 6, // lucía dropped with es-popular
        nameEntries: 7,
      });
      expect(counts(tdb.db)).toEqual(countsAfterReset);
    } finally {
      tdb.cleanup();
    }
  });

  it('a re-seed with changed data updates rows in place (same ids, new values)', () => {
    const tdb = createTestDb();
    try {
      const v1 = fixtureDatasets();
      seedDatabase(tdb.db, v1, mergeDatasets(v1).names);
      const before = snapshot(tdb.db);

      // change a meaning and a dataset description
      const v2 = fixtureDatasets();
      v2[2]!.data.entries[1]!.meaning = 'wisdom (updated)';
      v2[2]!.data.description = 'Updated description';
      seedDatabase(tdb.db, v2, mergeDatasets(v2).names);
      const after = snapshot(tdb.db);

      // no row churn: same ids and same created_at timestamps
      expect(after.names.map((n) => n.id)).toEqual(before.names.map((n) => n.id));
      expect(after.names.map((n) => n.createdAt)).toEqual(before.names.map((n) => n.createdAt));
      expect(after.nameEntries).toHaveLength(before.nameEntries.length);

      // values updated in place: the (sofia, es-popular) entry carries the new meaning
      const sofia = after.names.find((n) => n.normalizedKey === 'sofia')!;
      const esPopular = after.datasets.find((d) => d.key === 'es-popular')!;
      const sofiaEs = tdb.db
        .select()
        .from(schema.nameEntries)
        .where(
          and(
            eq(schema.nameEntries.nameId, sofia.id),
            eq(schema.nameEntries.datasetId, esPopular.id),
          ),
        )
        .get();
      expect(sofiaEs?.meaning).toBe('wisdom (updated)');
      expect(esPopular.description).toBe('Updated description');
    } finally {
      tdb.cleanup();
    }
  });
});

describe('seed pipeline end-to-end (files → validate → merge → seed → report)', () => {
  const tdb = createTestDb();
  const dir = makeDataDir();

  afterAll(() => {
    tdb.cleanup();
    dir.cleanup();
  });

  it('runs the full CLI-equivalent flow over fixture files', () => {
    writeDatasetDir(
      dir.dir,
      fixtureDatasets().map((d) => d.data),
    );

    // validate first — files on disk must parse and pass semantic rules
    const validation = validateDataDir(dir.dir);
    expect(validation.ok).toBe(true);

    // load → merge → seed (exactly what cli/seed.ts does)
    const { datasets } = loadDataDir(dir.dir);
    const merged: MergeResult = mergeDatasets(datasets, dir.dir);
    const seeded = seedDatabase(tdb.db, datasets, merged.names);

    expect(seeded).toEqual({ datasets: 3, names: 7, nameEntries: 10 });

    // report totals agree with the seeded rows
    expect(merged.report.totals).toEqual({
      datasets: 3,
      entries: 10,
      canonical_names: 7,
      merged_names: 3,
      name_entry_rows: 10,
    });
    expect(merged.report.merges.map((m) => m.normalized_key)).toEqual(['jose', 'kai', 'sofia']);

    // spot-check the José merge landed as one canonical row + two entries
    const jose = tdb.db
      .select()
      .from(schema.names)
      .where(eq(schema.names.normalizedKey, 'jose'))
      .all();
    expect(jose).toHaveLength(1);
    expect(jose[0]!.display).toBe('Jose'); // 1-1 spelling tie → lowest sort_order dataset (us)
    expect(jose[0]!.genderTags).toEqual(['boy']);
    const joseEntries = tdb.db
      .select()
      .from(schema.nameEntries)
      .where(eq(schema.nameEntries.nameId, jose[0]!.id))
      .all();
    expect(joseEntries).toHaveLength(2);
  });
});
