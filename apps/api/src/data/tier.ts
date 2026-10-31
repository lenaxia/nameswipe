import type { DatasetEntry, Tier } from './contract.js';

/**
 * Tier derivation, per the data-platform contract:
 *
 *   popularity_rank 1–500    → popular
 *   popularity_rank 501–1000 → uncommon
 *   popularity_rank 1001–2000 → rare
 *   rank absent or > 2000    → curator tier if supplied, else 'unranked'
 *
 * For ranked entries inside 1–2000 the derived band is authoritative: the
 * validator rejects a curator `tier` that contradicts the rank, so by the
 * time data reaches the merge/seeder the two always agree.
 */
export function bandForRank(rank: number): Tier {
  if (rank >= 1 && rank <= 500) return 'popular';
  if (rank >= 501 && rank <= 1000) return 'uncommon';
  if (rank >= 1001 && rank <= 2000) return 'rare';
  return 'unranked';
}

export function tierForEntry(entry: Pick<DatasetEntry, 'popularity_rank' | 'tier'>): Tier {
  const rank = entry.popularity_rank;
  if (rank !== undefined && rank >= 1 && rank <= 2000) {
    return bandForRank(rank);
  }
  return entry.tier ?? 'unranked';
}
