import { afterAll, describe, expect, it } from 'vitest';
import * as schema from './schema.js';
import { createTestDb, type TestDb } from './testing.js';

/**
 * Parallel-isolation proof, file A of two. isolation-a.test.ts and
 * isolation-b.test.ts each get their own createTestDb() and assert that they
 * observe ONLY their own marker rows. Vitest runs test files concurrently by
 * default; if the two files shared a database, both would see two markers.
 */
const test: TestDb = createTestDb();
afterAll(() => test.cleanup());

describe('createTestDb isolation (file A)', () => {
  it('observes only rows written in this file', () => {
    test.db
      .insert(schema.datasets)
      .values({ key: 'marker-file-a', name: 'A', description: 'marker', sortOrder: 1 })
      .run();

    const keys = test.db.select({ key: schema.datasets.key }).from(schema.datasets).all();
    expect(keys).toEqual([{ key: 'marker-file-a' }]);
  });

  it('still observes only its own rows on a later read', () => {
    const keys = test.db.select({ key: schema.datasets.key }).from(schema.datasets).all();
    expect(keys).toEqual([{ key: 'marker-file-a' }]);
  });
});
