import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { createMatchMediaStub } from './match-media';

// jsdom's matchMedia never matches and never fires change events; pin a
// controllable stub (mobile by default) for every test.
vi.stubGlobal('matchMedia', createMatchMediaStub(false));

// vitest runs without globals:true, so RTL's auto-cleanup never registers.
afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});
