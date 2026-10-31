import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Schema v1 — PostgreSQL-portable by construction.
 *
 * Column kinds are restricted to the drizzle set that maps cleanly onto
 * PostgreSQL (see the pg-core equivalents in braces):
 *
 *   integer(id, autoincrement)   -> serial / integer        {serial}
 *   integer(timestamp_ms)        -> epoch-milliseconds date {timestamp}
 *   text                         -> utf-8 string             {text}
 *   text({ mode: 'json' })       -> drizzle's json column   {jsonb}
 *
 * No blob / real / numeric affinity, no SQLite-only types. JSON payloads
 * (names.gender_tags, rooms.settings) use drizzle's json column kind, which
 * SQLite stores as serialized TEXT and PostgreSQL would store as jsonb.
 */

export const datasets = sqliteTable('datasets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const names = sqliteTable('names', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  normalizedKey: text('normalized_key').notNull().unique(),
  display: text('display').notNull(),
  genderTags: text('gender_tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});

export const nameEntries = sqliteTable(
  'name_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nameId: integer('name_id')
      .notNull()
      .references(() => names.id, { onDelete: 'cascade' }),
    datasetId: integer('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    gender: text('gender').notNull(),
    popularityRank: integer('popularity_rank'),
    tier: text('tier'),
    romanization: text('romanization'),
    origin: text('origin'),
    meaning: text('meaning'),
  },
  (t) => [
    unique('name_entries_name_id_dataset_id_unique').on(t.nameId, t.datasetId),
    check('name_entries_gender_check', sql`${t.gender} in ('boy', 'girl', 'neutral')`),
    check('name_entries_tier_check', sql`${t.tier} in ('popular', 'uncommon', 'rare', 'unranked')`),
  ],
);

export type RoomSettings = Record<string, unknown>;

export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  settings: text('settings', { mode: 'json' }).$type<RoomSettings>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});

export const members = sqliteTable('members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roomId: integer('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});

export const swipes = sqliteTable(
  'swipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    nameId: integer('name_id')
      .notNull()
      .references(() => names.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch('subsec') * 1000)`),
  },
  (t) => [
    unique('swipes_member_id_name_id_unique').on(t.memberId, t.nameId),
    check('swipes_direction_check', sql`${t.direction} in ('like', 'dislike')`),
  ],
);

// -- Inferred types -------------------------------------------------------------

export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;

export type Name = typeof names.$inferSelect;
export type NewName = typeof names.$inferInsert;

export type NameEntry = typeof nameEntries.$inferSelect;
export type NewNameEntry = typeof nameEntries.$inferInsert;

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type Swipe = typeof swipes.$inferSelect;
export type NewSwipe = typeof swipes.$inferInsert;
