import { describe, expect, it } from 'vitest';
import { bandForRank, tierForEntry } from './tier.js';

describe('bandForRank', () => {
  it.each([
    [1, 'popular'],
    [250, 'popular'],
    [500, 'popular'],
    [501, 'uncommon'],
    [750, 'uncommon'],
    [1000, 'uncommon'],
    [1001, 'rare'],
    [1500, 'rare'],
    [2000, 'rare'],
    [2001, 'unranked'],
    [5000, 'unranked'],
  ])('rank %d → %s', (rank, expected) => {
    expect(bandForRank(rank)).toBe(expected);
  });
});

describe('tierForEntry', () => {
  it('derives the band for ranked entries, ignoring any curator tier', () => {
    expect(tierForEntry({ popularity_rank: 500 })).toBe('popular');
    expect(tierForEntry({ popularity_rank: 501 })).toBe('uncommon');
    expect(tierForEntry({ popularity_rank: 1000 })).toBe('uncommon');
    expect(tierForEntry({ popularity_rank: 1001 })).toBe('rare');
    expect(tierForEntry({ popularity_rank: 2000 })).toBe('rare');
    expect(tierForEntry({ popularity_rank: 2001 })).toBe('unranked');
  });

  it('falls back to unranked when rank is absent and no curator tier is set', () => {
    expect(tierForEntry({})).toBe('unranked');
  });

  it('uses the curator tier for absent ranks', () => {
    expect(tierForEntry({ tier: 'rare' })).toBe('rare');
    expect(tierForEntry({ tier: 'popular' })).toBe('popular');
  });

  it('allows a curator tier to rescue ranks beyond 2000', () => {
    expect(tierForEntry({ popularity_rank: 2500, tier: 'rare' })).toBe('rare');
    expect(tierForEntry({ popularity_rank: 2001, tier: 'uncommon' })).toBe('uncommon');
  });
});
