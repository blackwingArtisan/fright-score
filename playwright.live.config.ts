import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test against the deployed site, kept out of `npm test` because it needs the network.
 * Run it after a deploy: `npm run test:live` (or set LIVE_URL to check a preview deployment).
 */
export default defineConfig({
  testDir: 'tests/live',
  timeout: 120_000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://fright-score.pages.dev',
    launchOptions: { args: ['--disable-audio-output'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
