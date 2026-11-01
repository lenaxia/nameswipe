import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { GENDER_ORDER, TIER_ORDER, type Gender, type Tier } from '../data/contract.js';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import type { RoomConfig } from './config.js';

/**
 * Member deck — the filtered, swipe-aware, per-member name stack behind
 * GET /api/rooms/:code/members/:memberId/deck.
 *
 * A canonical name qualifies when it satisfies EVERY configured filter:
 *
 *   dataset   it has a name_entries row in one of room.datasets
 *   gender    names.genderTags ∩ room.genders ≠ ∅ — the name-level union
 *             tags from the seed merge, not per-entry genders
 *   tier      its BEST tier across the room-dataset entries ∈ room.tiers;
 *             "best" = most popular band (TIER_ORDER is popularity order,
 *             so 'popular' beats 'uncommon' beats 'rare' beats 'unranked')
 *   origin    when room.origins is configured (non-empty): at least one of
 *             the name's room-dataset entries carries an origin that equals
 *             one of the configured strings (exact match, case-sensitive)
 *   letters   when room.firstLetters is configured (non-empty): the first
 *             character of the display form, lowercased, is one of the
 *             letters (case-insensitive; config letters are lowercase a-z)
 *   swipes    names THIS member already swiped are excluded — another
 *             member's swipes never touch my deck
 *
 * An empty optional array (origins: [], firstLetters: []) is treated as
 * "filter not configured" so a room always keeps its unfiltered candidate
 * set; only a non-empty array narrows.
 */

export interface DeckNameDto {
  /** names.id — the handle a swipe is recorded against. */
  nameId: number;
  display: string;
  /** First non-null romanization across the name's entries (see pickFirst). */
  romanization?: string;
  meaning?: string;
  origin?: string;
  /** Canonical union tags, in GENDER_ORDER. */
  genderTags: Gender[];
  /** Room-configured dataset keys the name appears in, by dataset sort order. */
  datasets: string[];
  /** Best (most popular) tier among the name's room-dataset entries. */
  tier: Tier;
}

export interface MemberDeckDto {
  names: DeckNameDto[];
}

/**
 * Deterministic deck order — the seed approach, per charter.
 *
 * Every name gets a shuffle key derived from a hash of
 * `nameswipe-deck-v1:{roomId}:{memberId}:{nameId}`: the digest seeds a
 * mulberry32 PRNG whose first draw is the key. Because the key is a pure
 * function of (room, member, name) — never of the surrounding candidate
 * set — the same room+member always produces the identical order, a
 * different member (different seed material) gets an independent order,
 * and excluding swiped names simply drops cards WITHOUT re-keying the
 * survivors: what remains is a subsequence of the previous order, so a
 * member never sees their undealt deck jump around between calls.
 *
 * The final sort is (key asc, nameId asc); the nameId tie-break makes the
 * order total even in the astronomically unlikely event of a key collision,
 * so determinism holds bit-for-bit across processes and restarts (SHA-256
 * and mulberry32 are both platform-stable; no Math.random anywhere).
 */
const DECK_SEED_NAMESPACE = 'nameswipe-deck-v1';

/** mulberry32 — small public-domain 32-bit seeded PRNG, fixed output curve. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleKey(roomId: number, memberId: number, nameId: number): number {
  const digest = createHash('sha256')
    .update(`${DECK_SEED_NAMESPACE}:${roomId}:${memberId}:${nameId}`)
    .digest();
  return mulberry32(digest.readUInt32BE(0))();
}

interface CandidateEntry {
  datasetKey: string;
  datasetSortOrder: number;
  tier: string | null;
  romanization: string | null;
  origin: string | null;
  meaning: string | null;
}

interface CandidateName {
  nameId: number;
  display: string;
  genderTags: string[];
  /** Entries ordered by (dataset sort_order, dataset key) — total order. */
  entries: CandidateEntry[];
  bestTier: Tier;
}

function canonicalGenderTags(tags: string[]): Gender[] {
  const present = new Set(tags);
  return GENDER_ORDER.filter((gender) => present.has(gender));
}

/** TIER_ORDER index of a stored tier; null or unknown tiers count as unranked. */
function tierRank(tier: string | null): number {
  const index = TIER_ORDER.indexOf((tier ?? 'unranked') as Tier);
  return index === -1 ? TIER_ORDER.indexOf('unranked') : index;
}

function bestTierOf(entries: CandidateEntry[]): Tier {
  let best = TIER_ORDER.length - 1;
  for (const entry of entries) {
    const rank = tierRank(entry.tier);
    if (rank < best) {
      best = rank;
    }
  }
  return TIER_ORDER[best];
}

/**
 * First non-null value of a passthrough field, walking the name's entries in
 * dataset order — the earliest curated dataset that supplied the field wins,
 * so payload fields are a deterministic pick, never a merge.
 */
function pickFirst(
  entries: CandidateEntry[],
  field: 'romanization' | 'origin' | 'meaning',
): string | undefined {
  for (const entry of entries) {
    if (entry[field] !== null) {
      return entry[field];
    }
  }
  return undefined;
}

function loadCandidates(db: Db, datasetIds: number[]): Map<number, CandidateName> {
  const rows = db
    .select({
      nameId: schema.names.id,
      display: schema.names.display,
      genderTags: schema.names.genderTags,
      tier: schema.nameEntries.tier,
      romanization: schema.nameEntries.romanization,
      origin: schema.nameEntries.origin,
      meaning: schema.nameEntries.meaning,
      datasetKey: schema.datasets.key,
      datasetSortOrder: schema.datasets.sortOrder,
    })
    .from(schema.nameEntries)
    .innerJoin(schema.names, eq(schema.nameEntries.nameId, schema.names.id))
    .innerJoin(schema.datasets, eq(schema.nameEntries.datasetId, schema.datasets.id))
    .where(inArray(schema.nameEntries.datasetId, datasetIds))
    .all();

  const candidates = new Map<number, CandidateName>();
  for (const row of rows) {
    let candidate = candidates.get(row.nameId);
    if (!candidate) {
      candidate = {
        nameId: row.nameId,
        display: row.display,
        genderTags: row.genderTags,
        entries: [],
        bestTier: 'unranked',
      };
      candidates.set(row.nameId, candidate);
    }
    candidate.entries.push({
      datasetKey: row.datasetKey,
      datasetSortOrder: row.datasetSortOrder,
      tier: row.tier,
      romanization: row.romanization,
      origin: row.origin,
      meaning: row.meaning,
    });
  }

  for (const candidate of candidates.values()) {
    candidate.entries.sort(
      (a, b) => a.datasetSortOrder - b.datasetSortOrder || a.datasetKey.localeCompare(b.datasetKey),
    );
    candidate.bestTier = bestTierOf(candidate.entries);
  }
  return candidates;
}

export function buildMemberDeck(db: Db, room: schema.Room, member: schema.Member): MemberDeckDto {
  const config = room.settings.config as RoomConfig;

  // Room-configured datasets resolved to rows. Keys were validated at room
  // creation; a key that vanished since is ignored rather than fatal.
  const datasetIds = db
    .select({ id: schema.datasets.id })
    .from(schema.datasets)
    .where(inArray(schema.datasets.key, config.datasets))
    .all()
    .map((row) => row.id);

  const swipedNameIds = new Set(
    db
      .select({ nameId: schema.swipes.nameId })
      .from(schema.swipes)
      .where(eq(schema.swipes.memberId, member.id))
      .all()
      .map((row) => row.nameId),
  );

  const candidates = loadCandidates(db, datasetIds);

  const roomGenders = new Set<string>(config.genders);
  const roomTiers = new Set<string>(config.tiers);
  const origins = config.origins ?? [];
  const originFilterActive = origins.length > 0;
  const letters = config.firstLetters ?? [];
  const letterFilterActive = letters.length > 0;

  const picked: DeckNameDto[] = [];
  for (const candidate of candidates.values()) {
    if (!canonicalGenderTags(candidate.genderTags).some((gender) => roomGenders.has(gender))) {
      continue;
    }
    if (!roomTiers.has(candidate.bestTier)) {
      continue;
    }
    if (
      originFilterActive &&
      !candidate.entries.some((entry) => entry.origin !== null && origins.includes(entry.origin))
    ) {
      continue;
    }
    if (letterFilterActive && !letters.includes(candidate.display.charAt(0).toLowerCase())) {
      continue;
    }
    if (swipedNameIds.has(candidate.nameId)) {
      continue;
    }
    picked.push(toDeckNameDto(candidate));
  }

  const keyed = picked.map((name) => ({
    name,
    key: shuffleKey(room.id, member.id, name.nameId),
  }));
  keyed.sort((a, b) => a.key - b.key || a.name.nameId - b.name.nameId);

  return { names: keyed.map(({ name }) => name) };
}

function toDeckNameDto(candidate: CandidateName): DeckNameDto {
  const dto: DeckNameDto = {
    nameId: candidate.nameId,
    display: candidate.display,
    genderTags: canonicalGenderTags(candidate.genderTags),
    datasets: candidate.entries.map((entry) => entry.datasetKey),
    tier: candidate.bestTier,
  };
  const romanization = pickFirst(candidate.entries, 'romanization');
  if (romanization !== undefined) {
    dto.romanization = romanization;
  }
  const meaning = pickFirst(candidate.entries, 'meaning');
  if (meaning !== undefined) {
    dto.meaning = meaning;
  }
  const origin = pickFirst(candidate.entries, 'origin');
  if (origin !== undefined) {
    dto.origin = origin;
  }
  return dto;
}
