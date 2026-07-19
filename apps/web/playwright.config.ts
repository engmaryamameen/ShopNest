import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // auth tests share state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Don't start a server — assumes dev is already running
  webServer: process.env.CI
    ? {
        command: 'pnpm start',
        url: process.env.WEB_URL ?? 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120000,
      }
    : undefined,
});
