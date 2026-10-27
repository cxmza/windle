import { defineConfig } from 'vitest/config';

// The first test of each file boots a whole Fastify app (plugins, every route, cold module init). With files running
// in parallel on a slow disk that alone took 5-7 s here, past vitest's 5 s default, so the budget is per test, not per file.
export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
