import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Token guard: the design-token contract is enforceable, not aspirational.
 * Raw color literals and arbitrary Tailwind values must not appear anywhere
 * in the component/page source — everything routes through the @theme
 * tokens defined once in src/index.css.
 */

const SRC = join(__dirname, '..', '..', '..'); // apps/web/src
const UI_DIR = join(SRC, 'components', 'ui');

function collectSourceFiles(dir: string, skipTests = true): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (skipTests && entry === '__tests__') continue;
      out.push(...collectSourceFiles(full, skipTests));
    } else if (/\.(tsx?|ts)$/.test(entry) && entry !== 'index.css') {
      out.push(full);
    }
  }
  return out;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCTION = /\b(?:rgb|rgba|hsl|hsla|hwb|oklch|oklab|lab|lch)\(/i;
/** Tailwind arbitrary values, e.g. `w-[137px]`, `text-[#fff]`, `top-[7rem]` */
const ARBITRARY_UTILITY = /[a-z0-9]+-\[[^\]]+\]/;

describe('design token guard', () => {
  const uiFiles = collectSourceFiles(UI_DIR);
  const otherFiles = [
    ...collectSourceFiles(join(SRC, 'pages')),
    ...collectSourceFiles(join(SRC, 'lib')),
    join(SRC, 'App.tsx'),
  ].filter((file) => {
    try {
      statSync(file);
      return true;
    } catch {
      return false;
    }
  });

  it('covers the whole ui library', () => {
    const names = uiFiles.map((file) => file.split('/').pop());
    for (const primitive of [
      'Button.tsx',
      'IconButton.tsx',
      'Chip.tsx',
      'Tabs.tsx',
      'BottomSheet.tsx',
      'EmptyState.tsx',
      'ScreenHeader.tsx',
      'Spinner.tsx',
      'Skeleton.tsx',
      'icons.tsx',
      'index.ts',
    ]) {
      expect(names, `missing ${primitive}`).toContain(primitive);
    }
  });

  it.each(uiFiles)('uses no raw color literals: %s', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source, 'hex color literal').not.toMatch(HEX);
    expect(source, 'css color function').not.toMatch(COLOR_FUNCTION);
  });

  it.each(otherFiles)('uses no raw color literals: %s', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source, 'hex color literal').not.toMatch(HEX);
    expect(source, 'css color function').not.toMatch(COLOR_FUNCTION);
  });

  it.each(uiFiles)('uses no arbitrary Tailwind values in ui primitives: %s', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source, 'arbitrary utility value').not.toMatch(ARBITRARY_UTILITY);
  });

  it('styleguide inline styles reference tokens via CSS variables only', () => {
    const source = readFileSync(join(SRC, 'pages', 'Styleguide.tsx'), 'utf8');
    const inlineStyles = source.match(/style=\{\{[\s\S]*?\}\}/g) ?? [];
    expect(inlineStyles.length).toBeGreaterThan(0);
    for (const style of inlineStyles) {
      expect(style).toMatch(/var\(/);
      expect(style).not.toMatch(HEX);
      expect(style).not.toMatch(COLOR_FUNCTION);
    }
  });

  it('defines the token vocabulary once, in src/index.css', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    for (const token of [
      '--color-brand-500',
      '--color-danger-500',
      '--color-surface',
      '--color-ink',
      '--color-focus',
      '--spacing-control-md',
      '--radius-xl',
      '--shadow-md',
      '--text-base--line-height',
      '--container-modal',
      '--animate-sheet-in',
    ]) {
      expect(css, `missing ${token}`).toContain(token);
    }
    expect(css).toMatch(/@theme\s*\{/);
  });
});
