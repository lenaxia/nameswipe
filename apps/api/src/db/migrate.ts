import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './client.js';

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Applies every pending drizzle-kit migration from apps/api/drizzle.
 * Safe to call on a database that is already up to date.
 */
export function migrateDatabase(db: Db): void {
  migrate(db, { migrationsFolder });
}
