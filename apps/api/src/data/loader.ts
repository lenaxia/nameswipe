import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { datasetFileSchema, type ParsedDataset } from './contract.js';

/**
 * Loads `*.dataset.json` files from a data directory.
 *
 * Only top-level `*.dataset.json` files are read (non-recursive), so a
 * `data/samples/` fixture subdirectory or `data/sources.md` never leaks into
 * a production validate/seed run.
 */

export const DATASET_FILE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\.dataset\.json$/;

/** Structural problem found while reading/parsing one file. */
export type LoadError = {
  file: string;
  path: string;
  rule: 'json-parse' | 'file-name' | 'schema';
  message: string;
};

export type LoadResult = {
  datasets: ParsedDataset[];
  errors: LoadError[];
};

/** Renders a zod issue path (`['entries', 3, 'gender']`) as `entries[3].gender`. */
export function formatPath(path: (string | number | symbol)[]): string {
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') {
      out += `[${seg}]`;
    } else {
      out += out === '' ? String(seg) : `.${String(seg)}`;
    }
  }
  return out === '' ? '(file)' : out;
}

export function loadDataDir(dataDir: string): LoadResult {
  const datasets: ParsedDataset[] = [];
  const errors: LoadError[] = [];

  let files: string[];
  try {
    files = readdirSync(dataDir)
      .filter((f) => f.endsWith('.dataset.json'))
      .sort();
  } catch (err) {
    throw new Error(`cannot read data directory ${dataDir}: ${(err as Error).message}`, {
      cause: err,
    });
  }

  for (const fileName of files) {
    const filePath = join(dataDir, fileName);

    if (!DATASET_FILE_PATTERN.test(fileName)) {
      errors.push({
        file: fileName,
        path: '(file)',
        rule: 'file-name',
        message: `dataset file must be named <key>.dataset.json (kebab-case key), got '${fileName}'`,
      });
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
      errors.push({
        file: fileName,
        path: '(file)',
        rule: 'json-parse',
        message: `invalid JSON: ${(err as Error).message}`,
      });
      continue;
    }

    const parsed = datasetFileSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          file: fileName,
          path: formatPath(issue.path),
          rule: 'schema',
          message: issue.message,
        });
      }
      continue;
    }

    datasets.push({ fileName, filePath, data: parsed.data });
  }

  return { datasets, errors };
}
