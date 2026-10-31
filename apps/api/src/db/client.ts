import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

/**
 * Opens a SQLite database file and wraps it in drizzle. Foreign-key
 * enforcement (including ON DELETE CASCADE) is off by default in SQLite and
 * must be enabled per connection.
 */
export function openDatabase(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

/** The exact drizzle database type returned by {@link openDatabase} ($client included). */
export type Db = ReturnType<typeof openDatabase>;

/** Closes the underlying better-sqlite3 connection. */
export function closeDatabase(db: Db): void {
  db.$client.close();
}
