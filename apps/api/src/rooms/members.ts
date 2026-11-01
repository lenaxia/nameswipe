import { z } from 'zod';

/**
 * Room membership — joining a room as a partner.
 *
 * A room holds at most 2 members (the couple); the first join may happen
 * while solo and the second completes the pair.
 */

export const DEFAULT_NICKNAME = 'You';
export const NICKNAME_MAX = 24;
export const MAX_MEMBERS = 2;

/**
 * Nicknames are trimmed before any length check: 1-24 characters after
 * trimming, and whitespace-only is rejected (min(1) sees the trimmed value).
 */
export const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'nickname must not be empty')
  .max(NICKNAME_MAX, `nickname must be at most ${NICKNAME_MAX} characters`);

/**
 * Join body is entirely optional: a missing body, an empty object, or an
 * omitted nickname all default to 'You'.
 */
export const joinBodySchema = z
  .object({ nickname: nicknameSchema.optional() })
  .default({})
  .transform((body) => ({ nickname: body.nickname ?? DEFAULT_NICKNAME }));
