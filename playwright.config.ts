import { defineConfig } from '@playwright/test';

const baseURL = `http://localhost:${process.env.PORT ?? '8787'}`;
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm run dev:full',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
