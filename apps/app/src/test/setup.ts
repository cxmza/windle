import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_X_FEED', 'sample');

// Pages load lazily and render heavy rows; a slow CI box needs more than the 1 s default to settle.
configure({ asyncUtilTimeout: 5000 });

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('network disabled in tests');
    }),
  );
});

afterEach(() => cleanup());
