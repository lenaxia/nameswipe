import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DatasetEntry, DatasetFile, Gender, ParsedDataset } from './contract.js';

/** Test-only fixture builders for the data pipeline (production code never imports this). */

export type EntryInput = Partial<Omit<DatasetEntry, 'name'>> & {
  name: string;
};

export function entry(
  name: string,
  overrides: Partial<Omit<DatasetEntry, 'name'>> = {},
): DatasetEntry {
  return datasetEntry({ name, gender: 'neutral', ...overrides });
}

export function datasetEntry(e: EntryInput): DatasetEntry {
  return { gender: 'neutral', ...e } as DatasetEntry;
}

export function fixtureDataset(
  key: string,
  sortOrder: number,
  entries: DatasetEntry[],
  overrides: Partial<Omit<DatasetFile, 'key' | 'sort_order' | 'entries'>> = {},
): ParsedDataset {
  return {
    fileName: `${key}.dataset.json`,
    filePath: `/fixtures/${key}.dataset.json`,
    data: {
      key,
      name: overrides.name ?? `Fixture ${key}`,
      description: overrides.description ?? `Fixture dataset ${key}`,
      sort_order: sortOrder,
      requires_romanization: overrides.requires_romanization,
      entries,
    },
  };
}

/** A throwaway data directory: write files, validate/seed against it, clean up. */
export function makeDataDir(prefix = 'nameswipe-data-test-'): {
  dir: string;
  write: (fileName: string, json: unknown) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    write: (fileName, json) => {
      const target = join(dir, fileName);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, typeof json === 'string' ? json : JSON.stringify(json));
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function writeDatasetDir(dir: string, datasets: DatasetFile[]): void {
  mkdirSync(dir, { recursive: true });
  for (const ds of datasets) {
    writeFileSync(join(dir, `${ds.key}.dataset.json`), `${JSON.stringify(ds, null, 2)}\n`);
  }
}

export const genders: readonly Gender[] = ['boy', 'girl', 'neutral'];
