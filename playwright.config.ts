import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4201';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'on-first-retry',
    timezoneId: 'Asia/Manila',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1000 } },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command: 'node api/server.mjs --test',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm start -- --host 127.0.0.1 --port 4201 --configuration e2e',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
