import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { ApiError } from '../errors.js';
import type { RoomConfig } from './config.js';

/**
 * Swipes API — recording likes/nopes and deriving matches.
 *
 * MATCHES ARE ALWAYS DERIVED BY QUERY, NEVER STORED. A match is a property of
 * the swipes table at read time: a name BOTH members of a room liked. That
 * makes undo (deleting a swipe) un-match automatically — there is no stored
 * flag to go stale.
 *
 * Direction vocabulary: the API speaks 'like' | 'nope' (the task contract),
 * while the landed swipes table constrains direction to 'like' | 'dislike'
 * (see the swipes_direction_check in db/schema.ts). The mapping below is the
 * single place the two vocabularies meet.
 */

export const swipeBodySchema = z.object({
  nameId: z.number().int().positive('nameId must be a positive integer'),
  direction: z.enum(['like', 'nope']),
});

export type SwipeBody = z.infer<typeof swipeBodySchema>;

/** API direction -> storage direction (the swipes.direction column). */
const STORAGE_DIRECTION: Record<SwipeBody['direction'], string> = {
  like: 'like',
  nope: 'dislike',
};

/**
 * 404 when the nameId resolves to no canonical names row at all. Distinct
 * from the 422 below: an existing name that is simply not in this room's
 * configured datasets is a room-config mismatch, not a missing name.
 */
function findNameOrThrow(db: Db, nameId: number): schema.Name {
  const name = db.select().from(schema.names).where(eq(schema.names.id, nameId)).get();
  if (!name) {
    throw new ApiError(404, 'name_not_found', `No name with id ${nameId}`);
  }
  return name;
}

/**
 * 422 when the name exists but none of its name_entries rows belongs to a
 * dataset configured for this room — a name from another room's datasets is
 * the canonical case.
 */
function assertNameInRoomDatasets(db: Db, room: schema.Room, name: schema.Name): void {
  const config = room.settings.config as RoomConfig;
  const datasetKeys = db
    .select({ key: schema.datasets.key })
    .from(schema.nameEntries)
    .innerJoin(schema.datasets, eq(schema.nameEntries.datasetId, schema.datasets.id))
    .where(eq(schema.nameEntries.nameId, name.id))
    .all()
    .map((entry) => entry.key);
  if (!datasetKeys.some((key) => config.datasets.includes(key))) {
    throw new ApiError(
      422,
      'name_not_in_room',
      `Name '${name.display}' is not in room '${room.code}' datasets`,
    );
  }
}

export interface DerivedMatch {
  nameId: number;
  display: string;
}

/**
 * THE derived-match query — the single source of truth for what "matched"
 * means. Returns every name that distinct members of this room have BOTH
 * liked (room capacity is 2, so >= 2 distinct likers == both members),
 * computed fresh from the swipes rows on every call. Never cached, never
 * stored — an undo between two calls is reflected by the very next call.
 */
export function findDerivedMatches(db: Db, room: schema.Room): DerivedMatch[] {
  const rows = db
    .select({
      nameId: schema.swipes.nameId,
      memberId: schema.swipes.memberId,
      display: schema.names.display,
    })
    .from(schema.swipes)
    .innerJoin(schema.members, eq(schema.swipes.memberId, schema.members.id))
    .innerJoin(schema.names, eq(schema.swipes.nameId, schema.names.id))
    .where(and(eq(schema.members.roomId, room.id), eq(schema.swipes.direction, 'like')))
    .all();

  const likers = new Map<number, { display: string; members: Set<number> }>();
  for (const row of rows) {
    let entry = likers.get(row.nameId);
    if (!entry) {
      entry = { display: row.display, members: new Set<number>() };
      likers.set(row.nameId, entry);
    }
    entry.members.add(row.memberId);
  }

  return [...likers.entries()]
    .filter(([, entry]) => entry.members.size >= 2)
    .map(([nameId, entry]) => ({ nameId, display: entry.display }))
    .sort((a, b) => a.display.localeCompare(b.display) || a.nameId - b.nameId);
}

/**
 * True iff some OTHER member of this room has a stored like on the name —
 * the like/like rule behind the { match } flag on POST. A nope never
 * satisfies it (the direction filter), and a like from a member of a
 * DIFFERENT room never satisfies it (the roomId scoping).
 */
function hasPartnerLike(db: Db, room: schema.Room, nameId: number, member: schema.Member): boolean {
  const partnerLike = db
    .select({ id: schema.swipes.id })
    .from(schema.swipes)
    .innerJoin(schema.members, eq(schema.swipes.memberId, schema.members.id))
    .where(
      and(
        eq(schema.members.roomId, room.id),
        eq(schema.swipes.nameId, nameId),
        eq(schema.swipes.direction, 'like'),
        ne(schema.swipes.memberId, member.id),
      ),
    )
    .get();
  return partnerLike !== undefined;
}

/**
 * Records a swipe and answers whether it produced a (derived) match:
 * match = direction is 'like' AND the other member already liked the name.
 * The 201 response's flag is computed from the table state, so it agrees
 * with findDerivedMatches by construction.
 */
export function recordSwipe(
  db: Db,
  room: schema.Room,
  member: schema.Member,
  body: SwipeBody,
): { match: boolean } {
  const name = findNameOrThrow(db, body.nameId);
  assertNameInRoomDatasets(db, room, name);

  const existing = db
    .select({ id: schema.swipes.id })
    .from(schema.swipes)
    .where(and(eq(schema.swipes.memberId, member.id), eq(schema.swipes.nameId, name.id)))
    .get();
  if (existing) {
    throw new ApiError(
      409,
      'swipe_already_exists',
      `Member already swiped '${name.display}' — undo it first to re-swipe`,
    );
  }

  db.insert(schema.swipes)
    .values({
      memberId: member.id,
      nameId: name.id,
      direction: STORAGE_DIRECTION[body.direction],
    })
    .run();

  const match = body.direction === 'like' && hasPartnerLike(db, room, name.id, member);
  return { match };
}

/**
 * Undo: deletes the member's swipe on the name. Because matches are derived,
 * the match (if any) is gone the moment this row is gone. 404 when there is
 * no such swipe — never swiped, already undone, or someone else's swipe.
 */
export function deleteSwipe(db: Db, member: schema.Member, nameId: number): void {
  const deleted = db
    .delete(schema.swipes)
    .where(and(eq(schema.swipes.memberId, member.id), eq(schema.swipes.nameId, nameId)))
    .run();
  if (deleted.changes === 0) {
    throw new ApiError(404, 'swipe_not_found', `No swipe by this member on name ${nameId}`);
  }
}
