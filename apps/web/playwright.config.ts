import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets e2e run beside other dev servers in the monorepo (app 5174, auth 5175, ...). Default 5173 = `npm run dev`.
const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  use: { baseURL },
  webServer: { command: `npm run dev -- --port ${port} --strictPort`, url: baseURL, reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-reduced-motion',
      use: { ...devices['Desktop Chrome'], contextOptions: { reducedMotion: 'reduce' } },
    },
  ],
});
