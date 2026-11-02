import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4200';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 3,
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
  webServer: {
    command: 'npm start -- --host 127.0.0.1 --port 4200',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
