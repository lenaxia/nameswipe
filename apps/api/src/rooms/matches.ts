import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import type { RoomConfig } from './config.js';
import { findDerivedMatchRows } from './swipes.js';

/**
 * Matches & likes read models — the two list screens.
 *
 *   matches: names BOTH members liked (the derived match set, most recent
 *            mutual like first) — a read view over the same findDerivedMatchRows
 *            core that backs the swipes endpoint's { match } flag, so the
 *            three can never disagree about what "matched" means.
 *   likes:   ONE member's own likes with their likedAt — every name they
 *            liked, whatever the partner has done (liked, noped, or not yet
 *            swiped). The partner's swipes never appear in my list.
 *
 * Like the deck, both views enrich names with the pick-first passthrough
 * fields (romanization / meaning / origin): walking the name's entries in
 * the room's dataset order, the earliest curated dataset that supplied the
 * field wins. A match card therefore carries exactly the details the deck
 * card carried.
 */

export interface MatchDto {
  nameId: number;
  display: string;
  romanization?: string;
  meaning?: string;
  origin?: string;
  /** ISO timestamp of the SECOND like — when the match came into existence. */
  matchedAt: string;
}

export interface LikeDto {
  nameId: number;
  display: string;
  romanization?: string;
  meaning?: string;
  origin?: string;
  /** ISO timestamp of this member's like. */
  likedAt: string;
}

interface NameDetails {
  display: string;
  romanization?: string;
  meaning?: string;
  origin?: string;
}

interface DetailEntry {
  datasetSortOrder: number;
  datasetKey: string;
  romanization: string | null;
  origin: string | null;
  meaning: string | null;
}

/**
 * Pick-first passthrough fields for the given names, scoped to the room's
 * configured datasets and walked in the same (dataset sort order, key)
 * order the deck uses — see deck.ts's pickFirst for the rule.
 */
function loadNameDetails(
  db: Db,
  config: RoomConfig,
  displays: Map<number, string>,
): Map<number, NameDetails> {
  const details = new Map<number, NameDetails>();
  if (displays.size === 0) {
    return details;
  }

  const rows = db
    .select({
      nameId: schema.nameEntries.nameId,
      romanization: schema.nameEntries.romanization,
      origin: schema.nameEntries.origin,
      meaning: schema.nameEntries.meaning,
      datasetKey: schema.datasets.key,
      datasetSortOrder: schema.datasets.sortOrder,
    })
    .from(schema.nameEntries)
    .innerJoin(schema.datasets, eq(schema.nameEntries.datasetId, schema.datasets.id))
    .where(
      and(
        inArray(schema.nameEntries.nameId, [...displays.keys()]),
        inArray(schema.datasets.key, config.datasets),
      ),
    )
    .all();

  const entries = new Map<number, DetailEntry[]>();
  for (const row of rows) {
    let list = entries.get(row.nameId);
    if (!list) {
      list = [];
      entries.set(row.nameId, list);
    }
    list.push(row);
  }

  for (const [nameId, list] of entries) {
    list.sort(
      (a, b) => a.datasetSortOrder - b.datasetSortOrder || a.datasetKey.localeCompare(b.datasetKey),
    );
    const detail: NameDetails = { display: displays.get(nameId)! };
    for (const field of ['romanization', 'meaning', 'origin'] as const) {
      const value = list.find((entry) => entry[field] !== null)?.[field];
      if (value !== undefined && value !== null) {
        detail[field] = value;
      }
    }
    details.set(nameId, detail);
  }
  return details;
}

/**
 * GET /api/rooms/:code/matches — the derived match list, most recent
 * mutual like first. matchedAt disappears with an undo because nothing is
 * stored: the row set itself is the match. A solo room has no partner, so
 * no name can clear the >= 2 distinct likers bar — the list is empty by
 * construction, not by special case.
 */
export function listMatches(db: Db, room: schema.Room): { matches: MatchDto[] } {
  const derived = findDerivedMatchRows(db, room);
  const displays = new Map(derived.map((row) => [row.nameId, row.display]));
  const details = loadNameDetails(db, room.settings.config as RoomConfig, displays);

  const matches = derived.map((row) => ({
    nameId: row.nameId,
    display: row.display,
    ...details.get(row.nameId),
    matchedAt: row.matchedAt.toISOString(),
  }));
  matches.sort((a, b) => {
    if (a.matchedAt !== b.matchedAt) {
      return a.matchedAt < b.matchedAt ? 1 : -1; // recency first
    }
    return a.nameId - b.nameId; // total order for same-millisecond matches
  });
  return { matches };
}

/**
 * GET /api/rooms/:code/members/:memberId/likes — this member's liked names,
 * most recent like first. Only direction='like' rows of THIS member of THIS
 * room qualify; nopes and the partner's swipes are invisible here.
 */
export function listLikes(db: Db, room: schema.Room, member: schema.Member): { likes: LikeDto[] } {
  const rows = db
    .select({
      nameId: schema.swipes.nameId,
      createdAt: schema.swipes.createdAt,
      display: schema.names.display,
    })
    .from(schema.swipes)
    .innerJoin(schema.names, eq(schema.swipes.nameId, schema.names.id))
    .where(
      // direction speaks the STORAGE vocabulary ('like' | 'dislike')
      and(eq(schema.swipes.memberId, member.id), eq(schema.swipes.direction, 'like')),
    )
    .all();

  const details = loadNameDetails(
    db,
    room.settings.config as RoomConfig,
    new Map(rows.map((row) => [row.nameId, row.display])),
  );

  const likes = rows.map((row) => ({
    nameId: row.nameId,
    display: row.display,
    ...details.get(row.nameId),
    likedAt: row.createdAt.toISOString(),
  }));
  likes.sort((a, b) => {
    if (a.likedAt !== b.likedAt) {
      return a.likedAt < b.likedAt ? 1 : -1; // recency first
    }
    return a.nameId - b.nameId; // total order for same-millisecond likes
  });
  return { likes };
}
