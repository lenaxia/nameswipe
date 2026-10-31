import { z } from 'zod';

/**
 * On-disk dataset contract: `data/<key>.dataset.json`.
 *
 * One file per curated dataset. `entries` holds the raw curated rows; the
 * pipeline normalizes, merges across datasets, derives tiers, and seeds.
 */

export const genderSchema = z.enum(['boy', 'girl', 'neutral']);

/** Curator-supplied tier. 'unranked' is never authored — it is derived. */
export const curatorTierSchema = z.enum(['popular', 'uncommon', 'rare']);

export const popularityRankSchema = z
  .number()
  .int('popularity_rank must be an integer')
  .min(1, 'popularity_rank must be >= 1');

export const datasetEntrySchema = z.object({
  /** Display form exactly as curated: 'José', 'Åsa', 'Mary Jane'. */
  name: z.string().min(1, 'name is required'),
  gender: genderSchema,
  meaning: z.string().optional(),
  origin: z.string().optional(),
  romanization: z.string().optional(),
  popularity_rank: popularityRankSchema.optional(),
  tier: curatorTierSchema.optional(),
});

export const datasetFileSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'key must be kebab-case (a-z, 0-9, -)'),
  name: z.string().min(1),
  description: z.string().min(1),
  sort_order: z.number().int().min(0),
  requires_romanization: z.boolean().optional(),
  entries: z.array(datasetEntrySchema).min(1, 'entries must not be empty'),
});

export type Gender = z.infer<typeof genderSchema>;
export type CuratorTier = z.infer<typeof curatorTierSchema>;
export type Tier = CuratorTier | 'unranked';

export type DatasetEntry = z.infer<typeof datasetEntrySchema>;
export type DatasetFile = z.infer<typeof datasetFileSchema>;

/** A parsed dataset file plus the context the pipeline needs about it. */
export type ParsedDataset = {
  /** File name, e.g. `us-popular.dataset.json` (violation paths cite this). */
  fileName: string;
  /** Absolute path on disk. */
  filePath: string;
  data: DatasetFile;
};

export const TIER_ORDER: readonly Tier[] = ['popular', 'uncommon', 'rare', 'unranked'];

/** Canonical, deterministic order for gender tags. */
export const GENDER_ORDER: readonly Gender[] = ['boy', 'girl', 'neutral'];
