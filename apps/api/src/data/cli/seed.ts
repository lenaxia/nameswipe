import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDatabase, closeDatabase } from '../../db/client.js';
import { migrateDatabase } from '../../db/migrate.js';
import { loadDataDir } from '../loader.js';
import { mergeDatasets } from '../merge.js';
import { seedDatabase } from '../seed.js';
import { validateDatasets, type Violation } from '../validate.js';
import { parseFlags, repoRoot } from './args.js';

/**
 * `npm run data:seed [-- --reset] [-- --data-dir <dir>] [-- --report <path>] [-- --db <path>]`
 *
 * Validates first (non-zero exit, nothing written, on any violation), then
 * merges, seeds idempotently, prints a merge report and writes it as JSON
 * (default `<data-dir>/merge-report.json`).
 */

function printViolations(violations: Violation[]): void {
  for (const v of violations) {
    console.error(`  ${v.file}  ${v.path}  [${v.rule}]  ${v.message}`);
  }
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const dataDir = flags.dataDir || join(repoRoot, 'data');
  const dbPath =
    flags.dbPath ??
    process.env.DATABASE_URL?.replace(/^file:/, '') ??
    join(repoRoot, 'apps/api/nameswipe.db');

  const { datasets, errors } = loadDataDir(dataDir);
  const violations = validateDatasets(datasets, errors);
  if (violations.length > 0) {
    console.error(`data seed aborted — ${violations.length} validation violation(s):`);
    printViolations(violations);
    process.exitCode = 1;
    return;
  }
  if (datasets.length === 0) {
    console.warn(`no *.dataset.json files found in ${dataDir} — nothing to seed`);
  }

  const { names, report } = mergeDatasets(datasets, dataDir);
  const db = openDatabase(dbPath);
  try {
    migrateDatabase(db);
    const counts = seedDatabase(db, datasets, names, { reset: flags.reset });
    printReport(report, counts, flags.reset);
  } finally {
    closeDatabase(db);
  }

  const reportPath = flags.reportPath ?? join(dataDir, 'merge-report.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`merge report written to ${reportPath}`);
}

function printReport(
  report: ReturnType<typeof mergeDatasets>['report'],
  counts: ReturnType<typeof seedDatabase>,
  reset: boolean,
): void {
  console.log(`\nNameSwipe data seed (${reset ? 'reset + reseed' : 'idempotent upsert'})`);
  for (const ds of report.datasets) {
    console.log(
      `  dataset ${ds.key.padEnd(16)} sort=${String(ds.sort_order).padEnd(4)} entries=${ds.entries}`,
    );
  }
  console.log(
    `  entries ${report.totals.entries} → canonical names ${report.totals.canonical_names}` +
      ` (merged across datasets: ${report.totals.merged_names})`,
  );
  console.log(
    `  tiers: popular=${report.tiers.popular} uncommon=${report.tiers.uncommon}` +
      ` rare=${report.tiers.rare} unranked=${report.tiers.unranked}`,
  );
  console.log(
    `  gender tags (names): boy=${report.gender_tags.boy} girl=${report.gender_tags.girl}` +
      ` neutral=${report.gender_tags.neutral}`,
  );
  for (const m of report.merges) {
    const spellings = Object.entries(m.spellings)
      .map(([s, n]) => `${s}×${n}`)
      .join(', ');
    console.log(
      `  merge ${m.normalized_key} → "${m.display}" [${m.gender_tags.join('+')}] ` +
        `from ${m.datasets.join(', ')} (${spellings})`,
    );
  }
  console.log(
    `db now holds: ${counts.datasets} datasets, ${counts.names} names, ` +
      `${counts.nameEntries} name_entries`,
  );
}

main();
