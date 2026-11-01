import { z } from 'zod';

/**
 * Room creation config — the filters a couple picks before swiping.
 *
 * `datasets`, `genders` and `tiers` are required and non-empty; `origins` and
 * `firstLetters` are optional narrowing filters. The parsed object is stored
 * verbatim as the room's config (no defaults are invented server-side), so
 * what a client sends is exactly what a GET hands back.
 */

export const genderSchema = z.enum(['boy', 'girl', 'neutral']);
export const tierSchema = z.enum(['popular', 'uncommon', 'rare', 'unranked']);

export const roomConfigSchema = z.object({
  datasets: z
    .array(z.string().min(1, 'dataset key must not be empty'))
    .min(1, 'pick at least one dataset'),
  genders: z.array(genderSchema).min(1, 'pick at least one gender'),
  tiers: z.array(tierSchema).min(1, 'pick at least one tier'),
  origins: z.array(z.string().min(1, 'origin must not be empty')).optional(),
  firstLetters: z
    .array(z.string().regex(/^[a-z]$/, 'must be a single lowercase letter a-z'))
    .optional(),
});

export type RoomConfig = z.infer<typeof roomConfigSchema>;
