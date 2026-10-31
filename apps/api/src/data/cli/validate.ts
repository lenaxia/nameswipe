import { join } from 'node:path';
import { validateDataDir, type Violation } from '../validate.js';
import { parseFlags, repoRoot } from './args.js';

/**
 * `npm run data:validate [-- --data-dir <dir>]`
 *
 * Exit 0 when every dataset file is clean; non-zero with one line per
 * violation, each carrying `file`, entry `path`, and rule.
 */

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const dataDir = flags.dataDir || join(repoRoot, 'data');

  const result = validateDataDir(dataDir);

  if (result.violations.length > 0) {
    console.error(`data validation FAILED — ${result.violations.length} violation(s):`);
    for (const v of result.violations as Violation[]) {
      console.error(`  ${v.file}  ${v.path}  [${v.rule}]  ${v.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.datasetCount === 0) {
    console.log(`no *.dataset.json files found in ${dataDir} — nothing to validate`);
    return;
  }

  console.log(
    `data validation OK — ${result.datasetCount} dataset(s), ${result.entryCount} entries, ` +
      `0 violations (${dataDir})`,
  );
}

main();
