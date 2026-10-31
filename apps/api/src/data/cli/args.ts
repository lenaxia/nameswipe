import { fileURLToPath } from 'node:url';

/** Repository root, resolved from apps/api/src/data/cli/. */
export const repoRoot = fileURLToPath(new URL('../../../../..', import.meta.url));

export type Flags = {
  reset: boolean;
  dataDir: string;
  reportPath: string | undefined;
  dbPath: string | undefined;
};

/**
 * Minimal flag parsing — right-sized for two CLIs. `--data-dir <dir>`,
 * `--report <path>`, `--db <path>`, `--reset` (may appear anywhere).
 */
export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { reset: false, dataDir: '', reportPath: undefined, dbPath: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--reset') {
      flags.reset = true;
    } else if (arg === '--data-dir') {
      flags.dataDir = argv[++i] ?? '';
    } else if (arg === '--report') {
      flags.reportPath = argv[++i];
    } else if (arg === '--db') {
      flags.dbPath = argv[++i];
    } else {
      throw new Error(`unknown argument '${arg}' (expected --reset, --data-dir, --report, --db)`);
    }
  }
  return flags;
}
