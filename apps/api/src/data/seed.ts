import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import type { ParsedDataset } from './contract.js';
import type { MergedName } from './merge.js';

/**
 * Idempotent seed: upserts datasets (by key), canonical names (by
 * normalized_key) and name_entries (by the (name_id, dataset_id) pair), so
 * running twice without --reset leaves identical table contents and no
 * duplicates.
 *
 * Rows that disappeared from the data files are NOT deleted on a plain
 * re-seed — pass `reset: true` (CLI `--reset`) to wipe the data-platform
 * tables first. Deleting names cascades to name_entries and swipes.
 */

export type SeedCounts = {
  datasets: number;
  names: number;
  nameEntries: number;
};

export type SeedOptions = {
  reset?: boolean;
};

export function seedDatabase(
  db: Db,
  datasets: ParsedDataset[],
  names: MergedName[],
  options: SeedOptions = {},
): SeedCounts {
  db.transaction((tx) => {
    if (options.reset) {
      tx.delete(schema.nameEntries).run();
      tx.delete(schema.names).run();
      tx.delete(schema.datasets).run();
    }

    // Datasets: upsert by key, keyed by very small cardinality.
    const datasetIds = new Map<string, number>();
    for (const ds of ordered(datasets)) {
      const row = tx
        .insert(schema.datasets)
        .values({
          key: ds.data.key,
          name: ds.data.name,
          description: ds.data.description,
          sortOrder: ds.data.sort_order,
        })
        .onConflictDoUpdate({
          target: schema.datasets.key,
          set: {
            name: ds.data.name,
            description: ds.data.description,
            sortOrder: ds.data.sort_order,
          },
        })
        .returning({ id: schema.datasets.id })
        .get();
      datasetIds.set(ds.data.key, row.id);
    }

    // Canonical names: upsert by normalized_key (created_at is never touched,
    // so re-seeds preserve the original insert timestamp).
    for (const name of names) {
      const row = tx
        .insert(schema.names)
        .values({
          normalizedKey: name.normalizedKey,
          display: name.display,
          genderTags: name.genderTags,
        })
        .onConflictDoUpdate({
          target: schema.names.normalizedKey,
          set: { display: name.display, genderTags: name.genderTags },
        })
        .returning({ id: schema.names.id })
        .get();

      for (const entry of name.entries) {
        tx.insert(schema.nameEntries)
          .values({
            nameId: row.id,
            datasetId: datasetIds.get(entry.datasetKey)!,
            gender: entry.gender,
            popularityRank: entry.popularityRank,
            tier: entry.tier,
            romanization: entry.romanization,
            origin: entry.origin,
            meaning: entry.meaning,
          })
          .onConflictDoUpdate({
            target: [schema.nameEntries.nameId, schema.nameEntries.datasetId],
            set: {
              gender: entry.gender,
              popularityRank: entry.popularityRank,
              tier: entry.tier,
              romanization: entry.romanization,
              origin: entry.origin,
              meaning: entry.meaning,
            },
          })
          .run();
      }
    }
  });

  return {
    datasets: count(db, schema.datasets),
    names: count(db, schema.names),
    nameEntries: count(db, schema.nameEntries),
  };
}

function count(
  db: Db,
  table: typeof schema.datasets | typeof schema.names | typeof schema.nameEntries,
): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .get();
  return row?.n ?? 0;
}

function ordered(datasets: ParsedDataset[]): ParsedDataset[] {
  return [...datasets].sort(
    (a, b) => a.data.sort_order - b.data.sort_order || a.data.key.localeCompare(b.data.key),
  );
}
