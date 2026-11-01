import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { SqliteError } from 'better-sqlite3';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { ApiError, type ValidationErrorDetail } from '../errors.js';
import { validate } from '../validate.js';
import { CODE_LENGTH, CODE_PATTERN, MAX_CODE_ATTEMPTS, generateRoomCode } from './codes.js';
import { roomConfigSchema, type RoomConfig } from './config.js';
import { MAX_MEMBERS, joinBodySchema } from './members.js';

/**
 * Rooms API.
 *
 * POST /api/rooms             create a room from a config, mint a unique pairing code
 * GET  /api/rooms/:code       fetch a room with its member count and config
 * POST /api/rooms/:code/join  join as a member (max 2 per room)
 * GET  /api/rooms/:code/members  list members ordered by joinedAt
 */

export interface RoomDto {
  id: number;
  code: string;
  config: RoomConfig;
  createdAt: string;
}

export interface MemberDto {
  memberId: string;
  nickname: string;
  joinedAt: string;
}

export interface RoomsRouterOptions {
  /** Deterministic code source for tests; defaults to crypto-random. */
  generateCode?: () => string;
}

const codeParamsSchema = z.object({
  code: z
    .string()
    .regex(CODE_PATTERN, `code must be ${CODE_LENGTH} characters from the pairing alphabet`),
});

function toRoomDto(room: schema.Room): RoomDto {
  return {
    id: room.id,
    code: room.code,
    config: room.settings.config as RoomConfig,
    createdAt: room.createdAt.toISOString(),
  };
}

/**
 * Member identity handle: the UUID minted at join time and stored in the
 * members.token column. Clients keep it and present it as their memberId.
 */
function toMemberDto(member: schema.Member): MemberDto {
  return {
    memberId: member.token,
    nickname: member.label,
    joinedAt: member.createdAt.toISOString(),
  };
}

function assertDatasetsExist(db: Db, config: RoomConfig): void {
  const rows = db
    .select({ key: schema.datasets.key })
    .from(schema.datasets)
    .where(inArray(schema.datasets.key, config.datasets))
    .all();
  const known = new Set(rows.map((row) => row.key));
  const details: ValidationErrorDetail[] = config.datasets
    .filter((key) => !known.has(key))
    .map((key) => ({ path: 'datasets', message: `Unknown dataset: '${key}'` }));
  if (details.length > 0) {
    throw new ApiError(422, 'validation_error', 'Invalid room config', details);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof SqliteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Mints a unique pairing code and inserts the room. Collisions (from the
 * generator or a concurrent insert) retry with a fresh candidate; exhausting
 * the retry bound surfaces as a clean 500 instead of an infinite loop.
 */
function insertRoom(db: Db, config: RoomConfig, nextCode: () => string): schema.Room {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = nextCode();
    const existing = db
      .select({ id: schema.rooms.id })
      .from(schema.rooms)
      .where(eq(schema.rooms.code, code))
      .get();
    if (existing) {
      continue;
    }
    try {
      return db.insert(schema.rooms).values({ code, settings: { config } }).returning().get();
    } catch (err) {
      if (isUniqueViolation(err)) {
        continue;
      }
      throw err;
    }
  }
  throw new ApiError(
    500,
    'room_code_exhausted',
    `Could not generate a unique room code after ${MAX_CODE_ATTEMPTS} attempts; please retry`,
  );
}

function countMembers(db: Db, roomId: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.members)
    .where(eq(schema.members.roomId, roomId))
    .get();
  return row?.n ?? 0;
}

function findRoomOrThrow(db: Db, code: string): schema.Room {
  const room = db.select().from(schema.rooms).where(eq(schema.rooms.code, code)).get();
  if (!room) {
    throw new ApiError(404, 'room_not_found', `No room with code '${code}'`);
  }
  return room;
}

export function createRoomsRouter(db: Db, options: RoomsRouterOptions = {}): Router {
  const nextCode = options.generateCode ?? generateRoomCode;
  const router = Router();

  router.post('/api/rooms', validate({ body: roomConfigSchema }, { status: 422 }), (req, res) => {
    const config = req.body as RoomConfig;
    assertDatasetsExist(db, config);
    const room = insertRoom(db, config, nextCode);
    res.status(201).json({ code: room.code, room: toRoomDto(room) });
  });

  router.get('/api/rooms/:code', validate({ params: codeParamsSchema }), (req, res) => {
    const { code } = req.params as unknown as { code: string };
    const room = findRoomOrThrow(db, code);
    res.json({
      room: toRoomDto(room),
      memberCount: countMembers(db, room.id),
      config: room.settings.config as RoomConfig,
    });
  });

  router.post(
    '/api/rooms/:code/join',
    validate({ params: codeParamsSchema }),
    validate({ body: joinBodySchema }, { status: 422 }),
    (req, res) => {
      const { code } = req.params as unknown as { code: string };
      const { nickname } = req.body as { nickname: string };
      const room = findRoomOrThrow(db, code);
      if (countMembers(db, room.id) >= MAX_MEMBERS) {
        throw new ApiError(409, 'room_full', `Room '${code}' is full (${MAX_MEMBERS} members)`);
      }
      const member = db
        .insert(schema.members)
        .values({ roomId: room.id, label: nickname, token: randomUUID() })
        .returning()
        .get();
      res.status(201).json(toMemberDto(member));
    },
  );

  router.get('/api/rooms/:code/members', validate({ params: codeParamsSchema }), (req, res) => {
    const { code } = req.params as unknown as { code: string };
    const room = findRoomOrThrow(db, code);
    const rows = db
      .select()
      .from(schema.members)
      .where(eq(schema.members.roomId, room.id))
      .orderBy(schema.members.createdAt, schema.members.id)
      .all();
    res.json(rows.map(toMemberDto));
  });

  return router;
}
