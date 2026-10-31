import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DatasetFile } from './contract.js';
import { validateDataDir } from './validate.js';
import { makeDataDir } from './testkit.js';

/**
 * Fault injection: one fixture per violation class, each asserting the
 * violation carries a precise file + entry path.
 */

function validDataset(key = 'fault'): DatasetFile {
  return {
    key,
    name: `Fixture ${key}`,
    description: 'A valid fixture dataset',
    sort_order: 10,
    entries: [
      {
        name: 'Astrid',
        gender: 'girl',
        meaning: 'divinely beautiful',
        origin: 'Old Norse',
        popularity_rank: 600,
      },
      { name: 'Björn', gender: 'boy', meaning: 'bear' },
    ],
  };
}

type Case = {
  rule: string;
  build: (dir: ReturnType<typeof makeDataDir>) => void;
  expect: { file: string; path: string; rule: string };
};

const cases: Case[] = [
  {
    rule: 'json-parse',
    build: (dir) => dir.write('broken.dataset.json', '{ "key": "broken", '),
    expect: { file: 'broken.dataset.json', path: '(file)', rule: 'json-parse' },
  },
  {
    rule: 'schema: bad gender enum',
    build: (dir) => {
      const ds = validDataset();
      (ds.entries[0] as { gender: string }).gender = 'both';
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'entries[0].gender', rule: 'schema' },
  },
  {
    rule: 'schema: missing required name',
    build: (dir) => {
      const ds = validDataset();
      delete (ds.entries[1] as { name?: string }).name;
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'entries[1].name', rule: 'schema' },
  },
  {
    rule: 'schema: non-integer popularity_rank',
    build: (dir) => {
      const ds = validDataset();
      (ds.entries[0] as { popularity_rank?: number }).popularity_rank = 12.5;
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'entries[0].popularity_rank', rule: 'schema' },
  },
  {
    rule: 'duplicate-normalized-key (Kai/kai in ONE dataset)',
    build: (dir) => {
      const ds = validDataset();
      ds.entries.push({ name: 'Kai', gender: 'neutral' }, { name: 'kai', gender: 'boy' });
      dir.write('fault.dataset.json', ds);
    },
    expect: {
      file: 'fault.dataset.json',
      path: 'entries[3].name',
      rule: 'duplicate-normalized-key',
    },
  },
  {
    rule: 'duplicate-raw-name (exact same spelling twice)',
    build: (dir) => {
      const ds = validDataset();
      ds.entries.push({ name: 'Astrid', gender: 'neutral' });
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'entries[2].name', rule: 'duplicate-raw-name' },
  },
  {
    rule: 'tier-rank-mismatch',
    build: (dir) => {
      const ds = validDataset();
      // rank 600 derives 'uncommon'; curator says 'rare'
      ds.entries[0].tier = 'rare';
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'entries[0].tier', rule: 'tier-rank-mismatch' },
  },
  {
    rule: 'empty-field: meaning is blank',
    build: (dir) => {
      const ds = validDataset();
      ds.entries[1].meaning = '   ';
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'entries[1].meaning', rule: 'empty-field' },
  },
  {
    rule: 'empty-field: origin is empty string',
    build: (dir) => {
      const ds = validDataset();
      ds.entries[0].origin = '';
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'entries[0].origin', rule: 'empty-field' },
  },
  {
    rule: 'romanization-required',
    build: (dir) => {
      const ds = validDataset();
      ds.requires_romanization = true;
      // entries[0] has no romanization; entries[1] gets one
      ds.entries[1].romanization = 'BYURN';
      dir.write('fault.dataset.json', ds);
    },
    expect: {
      file: 'fault.dataset.json',
      path: 'entries[0].romanization',
      rule: 'romanization-required',
    },
  },
  {
    rule: 'romanization-required: blank string does not satisfy the requirement',
    build: (dir) => {
      const ds = validDataset();
      ds.requires_romanization = true;
      ds.entries[0].romanization = '  ';
      ds.entries[1].romanization = 'BYURN';
      dir.write('fault.dataset.json', ds);
    },
    expect: {
      file: 'fault.dataset.json',
      path: 'entries[0].romanization',
      rule: 'romanization-required',
    },
  },
  {
    rule: 'file-key-mismatch',
    build: (dir) => {
      const ds = validDataset('elsewhere');
      dir.write('fault.dataset.json', ds);
    },
    expect: { file: 'fault.dataset.json', path: 'key', rule: 'file-key-mismatch' },
  },
  {
    rule: 'file-name: not kebab-case',
    build: (dir) => dir.write('Bad_Name.dataset.json', validDataset('bad-name')),
    expect: { file: 'Bad_Name.dataset.json', path: '(file)', rule: 'file-name' },
  },
];

describe.each(cases)('validator fault injection: $rule', ({ build, expect: expected }) => {
  it('is caught with a precise file/entry path', () => {
    const dir = makeDataDir();
    try {
      build(dir);
      const result = validateDataDir(dir.dir);
      expect(result.ok).toBe(false);
      const hit = result.violations.find(
        (v) => v.file === expected.file && v.path === expected.path && v.rule === expected.rule,
      );
      expect(
        hit,
        `expected violation ${JSON.stringify(expected)} in ${JSON.stringify(result.violations)}`,
      ).toBeTruthy();
    } finally {
      dir.cleanup();
    }
  });
});

it('duplicate-raw-name also trips duplicate-normalized-key (same raw → same key)', () => {
  const dir = makeDataDir();
  try {
    const ds = validDataset();
    ds.entries.push({ name: 'Astrid', gender: 'neutral' });
    dir.write('fault.dataset.json', ds);
    const rules = validateDataDir(dir.dir).violations.map((v) => v.rule);
    expect(rules).toContain('duplicate-raw-name');
    expect(rules).toContain('duplicate-normalized-key');
  } finally {
    dir.cleanup();
  }
});

it('duplicate dataset key across two files is rejected (datasets.key is unique in the schema)', () => {
  const dir = makeDataDir();
  try {
    const a = validDataset('shared');
    const b = { ...validDataset('shared'), sort_order: 20, name: 'Second' };
    dir.write('a-shared.dataset.json', a);
    dir.write('b-shared.dataset.json', b);
    const result = validateDataDir(dir.dir);
    expect(result.ok).toBe(false);
    // the later file (a→b filename order) is flagged for re-declaring the key
    expect(
      result.violations.find(
        (v) => v.rule === 'duplicate-dataset-key' && v.file === 'b-shared.dataset.json',
      ),
    ).toMatchObject({ path: 'key' });
  } finally {
    dir.cleanup();
  }
});

it('a curator tier may rescue a rank beyond 2000 (charter: >2000 → unranked unless curated)', () => {
  const dir = makeDataDir();
  try {
    const ds = validDataset();
    ds.entries.push({ name: 'Freja', gender: 'girl', popularity_rank: 2001, tier: 'rare' });
    dir.write('fault.dataset.json', ds);
    const result = validateDataDir(dir.dir);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  } finally {
    dir.cleanup();
  }
});

it('clean fixtures pass with zero violations (ok: true)', () => {
  const dir = makeDataDir();
  try {
    dir.write('clean-a.dataset.json', validDataset('clean-a'));
    dir.write('clean-b.dataset.json', {
      ...validDataset('clean-b'),
      sort_order: 20,
      requires_romanization: true,
      entries: [{ name: '海斗', gender: 'boy', romanization: 'Kaito' }],
    });
    const result = validateDataDir(dir.dir);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.datasetCount).toBe(2);
    expect(result.entryCount).toBe(3);
  } finally {
    dir.cleanup();
  }
});

it('the committed sample fixtures in data/samples/ validate clean', () => {
  const samplesDir = fileURLToPath(new URL('../../../../data/samples', import.meta.url));
  const result = validateDataDir(samplesDir);
  expect(result.violations).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.datasetCount).toBeGreaterThan(0);
});

it('non-dataset files in the data dir are ignored (sources.md, merge-report.json, samples/)', () => {
  const dir = makeDataDir();
  try {
    dir.write('real.dataset.json', validDataset('real'));
    dir.write('sources.md', '# sources');
    dir.write('merge-report.json', { noise: true });
    dir.write('nested/wrong.dataset.json', validDataset('nested'));
    const result = validateDataDir(dir.dir);
    expect(result.ok).toBe(true);
    expect(result.datasetCount).toBe(1);
  } finally {
    dir.cleanup();
  }
});
