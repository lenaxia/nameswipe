import { randomInt } from 'node:crypto';

/**
 * Pairing-code generation.
 *
 * Codes are exactly 6 characters drawn from a 31-symbol "safe" alphabet with
 * the visually ambiguous glyphs removed: no 0/O, no 1/I/L. One couple reading
 * a code over the phone should never disagree about a character.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/**
 * Bound on collision retries. With 31^6 (~887 million) possible codes a
 * handful of retries is already extraordinary; the bound exists so a broken
 * code source degrades into a clean 500 instead of an infinite loop.
 */
export const MAX_CODE_ATTEMPTS = 10;

export const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Generates one random candidate code. Uniqueness is not checked here. */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}
