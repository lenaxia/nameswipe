import { describe, expect, it } from 'vitest';
import { mergeDatasets } from './merge.js';
import { entry, fixtureDataset } from './testkit.js';

describe('mergeDatasets', () => {
  it('merges Kai across 3 datasets into one canonical name with 3 entries and union gender tags', () => {
    const { names, report } = mergeDatasets([
      fixtureDataset('us-popular', 10, [
        entry('Kai', { gender: 'boy', popularity_rank: 93 }),
        entry('Liam', { gender: 'boy', popularity_rank: 1 }),
      ]),
      fixtureDataset('nordic', 20, [
        entry('Kai', { gender: 'neutral', meaning: 'variously "sea", "victory", or "fire"' }),
      ]),
      fixtureDataset('es-popular', 30, [entry('Kai', { gender: 'boy' })]),
    ]);

    const kai = names.filter((n) => n.normalizedKey === 'kai');
    expect(kai).toHaveLength(1);
    expect(kai[0]!.display).toBe('Kai');
    expect(kai[0]!.genderTags).toEqual(['boy', 'neutral']); // union, canonical order
    expect(kai[0]!.entries).toHaveLength(3);
    expect(kai[0]!.entries.map((e) => e.datasetKey)).toEqual([
      'us-popular',
      'nordic',
      'es-popular',
    ]);

    // 4 raw entries → 2 canonical names
    expect(names).toHaveLength(2);
    expect(report.totals).toEqual({
      datasets: 3,
      entries: 4,
      canonical_names: 2,
      merged_names: 1,
      name_entry_rows: 4,
    });
    expect(report.merges).toEqual([
      {
        normalized_key: 'kai',
        display: 'Kai',
        gender_tags: ['boy', 'neutral'],
        spellings: { Kai: 3 },
        datasets: ['us-popular', 'nordic', 'es-popular'],
      },
    ]);
  });

  it('merges José/Jose across datasets into one canonical row keyed jose', () => {
    const { names } = mergeDatasets([
      fixtureDataset('us-popular', 10, [entry('Jose', { gender: 'boy', popularity_rank: 96 })]),
      fixtureDataset('es-popular', 30, [entry('José', { gender: 'boy', meaning: 'God will add' })]),
    ]);

    expect(names).toHaveLength(1);
    const jose = names[0]!;
    expect(jose.normalizedKey).toBe('jose');
    expect(jose.genderTags).toEqual(['boy']);
    expect(jose.entries).toHaveLength(2);
    expect(jose.entries.map((e) => e.datasetKey).sort()).toEqual(['es-popular', 'us-popular']);
  });

  describe('display spelling selection', () => {
    it('picks the most frequent raw spelling across datasets', () => {
      // 'kai' appears twice (sort 20, 30) vs 'Kai' once (sort 10): frequency wins.
      const { names } = mergeDatasets([
        fixtureDataset('a', 10, [entry('Kai')]),
        fixtureDataset('b', 20, [entry('kai')]),
        fixtureDataset('c', 30, [entry('kai')]),
      ]);
      expect(names[0]!.display).toBe('kai');
    });

    it('breaks frequency ties with the entry from the lowest sort_order dataset', () => {
      // 1-1 tie between 'José' (sort 10) and 'Jose' (sort 30) → sort 10 wins.
      const { names } = mergeDatasets([
        fixtureDataset('a', 10, [entry('José')]),
        fixtureDataset('b', 30, [entry('Jose')]),
      ]);
      expect(names[0]!.display).toBe('José');
    });

    it('breaks remaining ties lexicographically for total determinism', () => {
      // Equal counts AND equal sort_order → A-Z raw spelling.
      const { names } = mergeDatasets([
        fixtureDataset('a', 10, [entry('Zoë')]),
        fixtureDataset('b', 10, [entry('Zoe')]),
      ]);
      expect(names[0]!.display).toBe('Zoe');
    });
  });

  it('produces one name_entries row per (canonical, dataset) with derived tiers', () => {
    const { names } = mergeDatasets([
      fixtureDataset('us-popular', 10, [entry('Sofia', { gender: 'girl', popularity_rank: 15 })]),
      fixtureDataset('es-popular', 30, [
        entry('Sofía', { gender: 'girl', popularity_rank: 60, meaning: 'wisdom' }),
      ]),
    ]);

    const sofia = names[0]!;
    expect(sofia.normalizedKey).toBe('sofia');
    expect(sofia.entries).toHaveLength(2);
    const byDataset = Object.fromEntries(sofia.entries.map((e) => [e.datasetKey, e]));
    expect(byDataset['us-popular']).toMatchObject({
      gender: 'girl',
      popularityRank: 15,
      tier: 'popular',
      meaning: null,
    });
    expect(byDataset['es-popular']).toMatchObject({
      gender: 'girl',
      popularityRank: 60,
      tier: 'popular',
      meaning: 'wisdom',
    });
  });

  it('treats a duplicate normalized key within ONE dataset as an error, not a merge', () => {
    expect(() =>
      mergeDatasets([fixtureDataset('a', 10, [entry('Kai'), entry('kai', { gender: 'boy' })])]),
    ).toThrowError(/duplicate normalized key 'kai' within dataset 'a'/);
  });

  it('reports per-dataset entry counts and tier distribution', () => {
    const { report } = mergeDatasets([
      fixtureDataset('a', 10, [
        entry('Liam', { popularity_rank: 1 }),
        entry('Astrid', { popularity_rank: 600 }),
      ]),
      fixtureDataset('b', 20, [
        entry('Maja', { popularity_rank: 1200 }),
        entry('Åsa'),
        entry('Kai', { popularity_rank: 2001, tier: 'rare' }),
      ]),
    ]);

    expect(report.datasets).toEqual([
      { key: 'a', name: 'Fixture a', sort_order: 10, entries: 2 },
      { key: 'b', name: 'Fixture b', sort_order: 20, entries: 3 },
    ]);
    expect(report.tiers).toEqual({ popular: 1, uncommon: 1, rare: 2, unranked: 1 });
    expect(report.gender_tags).toEqual({ boy: 0, girl: 0, neutral: 5 });
  });
});
