import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Opens a SQLite database file and wraps it in drizzle. Foreign-key
 * enforcement (including ON DELETE CASCADE) is off by default in SQLite and
 * must be enabled per connection.
 */
export function openDatabase(path: string): Db {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

/** Closes the underlying better-sqlite3 connection. */
export function closeDatabase(db: Db): void {
  db.$client.close();
}
