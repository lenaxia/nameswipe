import {
  GENDER_ORDER,
  TIER_ORDER,
  type Gender,
  type ParsedDataset,
  type Tier,
} from './contract.js';
import { normalizeName } from './normalize.js';
import { tierForEntry } from './tier.js';

/**
 * Cross-dataset merge engine.
 *
 * Entries are grouped by `normalized_key` across ALL datasets:
 *   - one canonical `names` row per key
 *       display     = most frequent raw spelling across the group;
 *                     tie → the spelling from the lowest-sort_order dataset;
 *                     still tied → lexicographic (total determinism)
 *       gender_tags = union of the contributing entries' genders
 *   - one `name_entries` row per (canonical name, dataset)
 *
 * The same normalized_key twice within ONE dataset is a validation error
 * (see validate.ts), never a merge — mergeDatasets throws if it sees one.
 */

export type MergedEntry = {
  datasetKey: string;
  gender: Gender;
  popularityRank: number | null;
  tier: Tier;
  romanization: string | null;
  origin: string | null;
  meaning: string | null;
};

export type MergedName = {
  normalizedKey: string;
  display: string;
  genderTags: Gender[];
  /** Contributing entries, ordered by dataset sort_order (then key). */
  entries: MergedEntry[];
};

export type MergeReport = {
  generated_at: string;
  data_dir: string;
  datasets: { key: string; name: string; sort_order: number; entries: number }[];
  totals: {
    datasets: number;
    entries: number;
    canonical_names: number;
    merged_names: number;
    name_entry_rows: number;
  };
  tiers: Record<Tier, number>;
  gender_tags: Record<Gender, number>;
  /** Canonical names that span more than one dataset, ordered by normalized_key. */
  merges: {
    normalized_key: string;
    display: string;
    gender_tags: Gender[];
    /** raw spelling -> number of entries using it (most frequent first). */
    spellings: Record<string, number>;
    datasets: string[];
  }[];
};

export type MergeResult = {
  /** Canonical names, ordered by normalized_key (stable seed order). */
  names: MergedName[];
  report: MergeReport;
};

type Group = {
  /** raw spelling -> frequency + lowest sort_order of a dataset using it. */
  spellings: Map<string, { count: number; minSortOrder: number }>;
  entries: MergedEntry[];
  genders: Set<Gender>;
};

export function mergeDatasets(datasets: ParsedDataset[], dataDir = ''): MergeResult {
  const orderedDatasets = [...datasets].sort(
    (a, b) => a.data.sort_order - b.data.sort_order || a.data.key.localeCompare(b.data.key),
  );

  const groups = new Map<string, Group>();

  for (const ds of orderedDatasets) {
    for (const entry of ds.data.entries) {
      const normalizedKey = normalizeName(entry.name);
      let group = groups.get(normalizedKey);
      if (!group) {
        group = { spellings: new Map(), entries: [], genders: new Set() };
        groups.set(normalizedKey, group);
      }

      // Within one dataset a normalized key may appear at most once;
      // duplicates are validation errors, not merges.
      if (group.entries.some((e) => e.datasetKey === ds.data.key)) {
        throw new Error(
          `duplicate normalized key '${normalizedKey}' within dataset '${ds.data.key}' — ` +
            `this is a validation error; run npm run data:validate`,
        );
      }

      const spelling = group.spellings.get(entry.name);
      if (spelling) {
        spelling.count += 1;
        spelling.minSortOrder = Math.min(spelling.minSortOrder, ds.data.sort_order);
      } else {
        group.spellings.set(entry.name, { count: 1, minSortOrder: ds.data.sort_order });
      }

      group.entries.push({
        datasetKey: ds.data.key,
        gender: entry.gender,
        popularityRank: entry.popularity_rank ?? null,
        tier: tierForEntry(entry),
        romanization: entry.romanization ?? null,
        origin: entry.origin ?? null,
        meaning: entry.meaning ?? null,
      });
      group.genders.add(entry.gender);
    }
  }

  const names: MergedName[] = [...groups.entries()]
    .map(([normalizedKey, group]) => ({
      normalizedKey,
      display: pickDisplay(group),
      genderTags: GENDER_ORDER.filter((g) => group.genders.has(g)),
      entries: group.entries,
    }))
    .sort((a, b) => a.normalizedKey.localeCompare(b.normalizedKey));

  const tiers = Object.fromEntries(TIER_ORDER.map((t) => [t, 0])) as Record<Tier, number>;
  const genderTags = Object.fromEntries(GENDER_ORDER.map((g) => [g, 0])) as Record<Gender, number>;
  for (const name of names) {
    for (const g of name.genderTags) genderTags[g] += 1;
    for (const e of name.entries) tiers[e.tier] += 1;
  }

  const report: MergeReport = {
    generated_at: new Date().toISOString(),
    data_dir: dataDir,
    datasets: orderedDatasets.map((ds) => ({
      key: ds.data.key,
      name: ds.data.name,
      sort_order: ds.data.sort_order,
      entries: ds.data.entries.length,
    })),
    totals: {
      datasets: orderedDatasets.length,
      entries: orderedDatasets.reduce((n, ds) => n + ds.data.entries.length, 0),
      canonical_names: names.length,
      merged_names: names.filter((n) => n.entries.length > 1).length,
      name_entry_rows: names.reduce((n, name) => n + name.entries.length, 0),
    },
    tiers,
    gender_tags: genderTags,
    merges: names
      .filter((n) => n.entries.length > 1)
      .map((n) => ({
        normalized_key: n.normalizedKey,
        display: n.display,
        gender_tags: n.genderTags,
        spellings: spellingsRecord(groups.get(n.normalizedKey)!),
        datasets: n.entries.map((e) => e.datasetKey),
      })),
  };

  return { names, report };
}

/** Most frequent raw spelling; tie → lowest sort_order dataset; tie → A-Z. */
function pickDisplay(group: Group): string {
  return [...group.spellings.entries()]
    .map(([spelling, s]) => ({ spelling, ...s }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.minSortOrder - b.minSortOrder ||
        a.spelling.localeCompare(b.spelling),
    )[0].spelling;
}

function spellingsRecord(group: Group): Record<string, number> {
  return Object.fromEntries(
    [...group.spellings.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .map(([spelling, s]) => [spelling, s.count]),
  );
}
