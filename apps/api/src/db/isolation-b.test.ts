import { afterAll, describe, expect, it } from 'vitest';
import * as schema from './schema.js';
import { createTestDb, type TestDb } from './testing.js';

/**
 * Parallel-isolation proof, file B of two. See isolation-a.test.ts.
 */
const test: TestDb = createTestDb();
afterAll(() => test.cleanup());

describe('createTestDb isolation (file B)', () => {
  it('observes only rows written in this file', () => {
    test.db
      .insert(schema.datasets)
      .values({ key: 'marker-file-b', name: 'B', description: 'marker', sortOrder: 1 })
      .run();

    const keys = test.db.select({ key: schema.datasets.key }).from(schema.datasets).all();
    expect(keys).toEqual([{ key: 'marker-file-b' }]);
  });

  it('still observes only its own rows on a later read', () => {
    const keys = test.db.select({ key: schema.datasets.key }).from(schema.datasets).all();
    expect(keys).toEqual([{ key: 'marker-file-b' }]);
  });
});
