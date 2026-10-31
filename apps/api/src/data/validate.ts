import type { ParsedDataset } from './contract.js';
import { loadDataDir, type LoadError } from './loader.js';
import { normalizeName } from './normalize.js';
import { bandForRank } from './tier.js';

/**
 * Dataset validation — `npm run data:validate`.
 *
 * Structural checks (JSON parse, zod schema) happen in the loader; this
 * module adds the semantic rules and produces one violation per problem with
 * a precise `file` + `path` (e.g. `entries[3].tier`) so curators can jump
 * straight to the offending entry.
 *
 * Rules:
 *   file-key-mismatch       file name <key> must match the `key` field
 *   duplicate-dataset-key   two files declaring the same dataset key
 *   duplicate-normalized-key  same normalized_key twice within ONE dataset
 *                             (that is a curation error, never a merge)
 *   duplicate-raw-name      same raw display name twice within one dataset
 *   tier-rank-mismatch      curator tier contradicts the derived rank band
 *   empty-field             meaning/origin/romanization present but blank
 *   romanization-required   dataset sets requires_romanization but an entry
 *                           has no (non-empty) romanization
 */

export type Violation = {
  file: string;
  path: string;
  rule: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  violations: Violation[];
  datasetCount: number;
  entryCount: number;
};

function fromLoadError(e: LoadError): Violation {
  return { file: e.file, path: e.path, rule: e.rule, message: e.message };
}

export function validateDatasets(datasets: ParsedDataset[], loadErrors: LoadError[]): Violation[] {
  const violations: Violation[] = loadErrors.map(fromLoadError);

  const seenKeys = new Map<string, string>(); // dataset key -> file that declared it
  for (const ds of datasets) {
    const { key, entries, requires_romanization } = ds.data;

    const fileStem = ds.fileName.replace(/\.dataset\.json$/, '');
    if (fileStem !== key) {
      violations.push({
        file: ds.fileName,
        path: 'key',
        rule: 'file-key-mismatch',
        message: `file is named '${fileStem}.dataset.json' but declares key '${key}'`,
      });
    }

    const firstFile = seenKeys.get(key);
    if (firstFile !== undefined) {
      violations.push({
        file: ds.fileName,
        path: 'key',
        rule: 'duplicate-dataset-key',
        message: `dataset key '${key}' is already declared by ${firstFile}`,
      });
    } else {
      seenKeys.set(key, ds.fileName);
    }

    const byNormalized = new Map<string, { name: string; index: number }>();
    const byRaw = new Map<string, number>();

    entries.forEach((entry, i) => {
      // Duplicate normalized_key within one dataset — a curation error, not a merge.
      const normalized = normalizeName(entry.name);
      const prior = byNormalized.get(normalized);
      if (prior !== undefined) {
        violations.push({
          file: ds.fileName,
          path: `entries[${i}].name`,
          rule: 'duplicate-normalized-key',
          message: `'${entry.name}' normalizes to '${normalized}', already used by entries[${prior.index}] ('${prior.name}') in this dataset — duplicates within one dataset are curation errors, not merges`,
        });
      } else {
        byNormalized.set(normalized, { name: entry.name, index: i });
      }

      // Duplicate raw display name within one dataset.
      const rawPrior = byRaw.get(entry.name);
      if (rawPrior !== undefined) {
        violations.push({
          file: ds.fileName,
          path: `entries[${i}].name`,
          rule: 'duplicate-raw-name',
          message: `raw name '${entry.name}' already appears at entries[${rawPrior}] in this dataset`,
        });
      } else {
        byRaw.set(entry.name, i);
      }

      // Rank/tier consistency: inside 1–2000 the derived band is authoritative.
      // Beyond 2000 a curator tier is an explicit override and always allowed
      // (">2000 or absent → unranked unless a curator tier is supplied").
      if (
        entry.popularity_rank !== undefined &&
        entry.popularity_rank >= 1 &&
        entry.popularity_rank <= 2000 &&
        entry.tier !== undefined
      ) {
        const derived = bandForRank(entry.popularity_rank);
        if (derived !== entry.tier) {
          violations.push({
            file: ds.fileName,
            path: `entries[${i}].tier`,
            rule: 'tier-rank-mismatch',
            message: `tier '${entry.tier}' contradicts popularity_rank ${entry.popularity_rank} (rank band is '${derived}')`,
          });
        }
      }

      // meaning/origin/romanization must be non-empty when present.
      for (const field of ['meaning', 'origin', 'romanization'] as const) {
        const value = entry[field];
        if (value !== undefined && value.trim() === '') {
          violations.push({
            file: ds.fileName,
            path: `entries[${i}].${field}`,
            rule: 'empty-field',
            message: `${field} is present but empty — omit the field or provide a non-empty value`,
          });
        }
      }

      // Dataset-wide romanization requirement.
      if (requires_romanization && (entry.romanization ?? '').trim() === '') {
        violations.push({
          file: ds.fileName,
          path: `entries[${i}].romanization`,
          rule: 'romanization-required',
          message: `dataset sets requires_romanization: true but '${entry.name}' has no romanization`,
        });
      }
    });
  }

  return violations;
}

/** Loads + validates a data directory in one step. */
export function validateDataDir(dataDir: string): ValidationResult {
  const { datasets, errors } = loadDataDir(dataDir);
  const violations = validateDatasets(datasets, errors);
  return {
    ok: violations.length === 0,
    violations,
    datasetCount: datasets.length,
    entryCount: datasets.reduce((n, ds) => n + ds.data.entries.length, 0),
  };
}
