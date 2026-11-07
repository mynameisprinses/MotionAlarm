import type { Page } from '@playwright/test';

import { test, expect, seedAlert, savedCount, createAccount, logIn } from './supabase';

declare global {
  interface Window {
    motionSample: { x: number; y: number; z: number };
    vibrationCalls: number;
    alarmSoundStarts: number;
    alarmSoundStops: number;
  }
}

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    window.vibrationCalls = 0;
    window.alarmSoundStarts = 0;
    window.alarmSoundStops = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = original.call(this);
      const start = oscillator.start.bind(oscillator);
      const stop = oscillator.stop.bind(oscillator);
      oscillator.start = (when?: number) => {
        window.alarmSoundStarts++;
        start(when);
      };
      oscillator.stop = (when?: number) => {
        window.alarmSoundStops++;
        stop(when);
      };
      return oscillator;
    };
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        window.vibrationCalls++;
        return true;
      },
    });
  });
});

async function samples(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.motionSample = { x: 0, y: 0, z: 9.81 };
    setInterval(
      () =>
        window.dispatchEvent(
          new DeviceMotionEvent('devicemotion', {
            acceleration: { x: 0, y: 0, z: 0 },
            accelerationIncludingGravity: window.motionSample,
            rotationRate: { alpha: 0, beta: 0, gamma: 0 },
            interval: 100,
          }),
        ),
      100,
    );
  });
}
async function history(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'View alert history' }).click();
  await expect(page).toHaveURL(/\/alert-history$/);
}
async function back(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back to monitor' }).click();
  await expect(page).toHaveURL(/\/home$/);
}
async function settings(page: Page): Promise<void> {
  await page.getByLabel('Open settings').click();
  await expect(page).toHaveURL(/\/settings$/);
}

test('REST history supports review, filtering, reload, deletion and clearing', async ({ page, request, account }) => {
  await seedAlert(request, account.uid, 'first');
  await seedAlert(request, account.uid, 'second');
  await history(page);
  await expect(page.locator('.alert-row')).toHaveCount(2);
  await page.locator('.alert-row').first().getByRole('button', { name: 'Mark reviewed' }).click();
  await page.getByRole('button', { name: 'Reviewed', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mark new', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No reviewed alerts' })).toBeVisible();
  await page.getByRole('button', { name: 'All alerts', exact: true }).click();
  await page.reload();
  await expect(page.locator('.alert-row')).toHaveCount(2);
  await page.locator('.alert-row').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.alert-row')).toHaveCount(2);
  await page.locator('.alert-row').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No alerts yet' })).toBeVisible();
  await expect.poll(() => savedCount(request, account.uid)).toBe(0);
});

test('movement saves one alert per session while history stays open', async ({ page, request, account }) => {
  await samples(page);
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Test alarm', exact: true })).toBeDisabled();
  await settings(page);
  await expect(page.getByLabel('Movement sensitivity')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeDisabled();
  await back(page);
  await expect(page.getByRole('heading', { name: 'Watching for movement' })).toBeVisible({ timeout: 8000 });
  await history(page);
  await page.evaluate(() => {
    window.motionSample = { x: 2.5, y: 0, z: 9.81 };
  });
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await expect.poll(() => savedCount(request, account.uid)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.vibrationCalls)).toBe(1);
  await back(page);
  await expect(page.getByRole('heading', { name: 'Your phone moved' })).toBeVisible();
  await page.getByRole('button', { name: 'Motion alarm stop', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.alarmSoundStops)).toBe(1);
  await page.reload();
  await history(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
});

test('test alarm plays sound and vibration without storing any alerts', async ({ page, request, account }) => {
  await page.getByRole('button', { name: 'Test alarm', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No alert was saved');
  await expect.poll(() => page.evaluate(() => window.alarmSoundStarts)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.alarmSoundStops)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.vibrationCalls)).toBe(1);
  await settings(page);
  await page.getByRole('switch', { name: 'Sound on alert' }).click();
  await back(page);
  await expect(
    page.getByText('Try the alarm sound and vibration without a motion sensor.', { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByText('Stopping asks for your screen-lock PIN', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Android keeps monitoring with a visible notification', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Test alarm', exact: true }).click();
  await history(page);
  await expect(page.getByRole('heading', { name: 'No alerts yet' })).toBeVisible();
  expect(await savedCount(request, account.uid)).toBe(0);
  await page.reload();
  await expect(page.locator('.alert-row')).toHaveCount(0);
});

test('date and status filters combine, and long lists scroll', async ({ page, request, account }) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  for (let i = 0; i < 24; i++) await seedAlert(request, account.uid, 'today-' + i);
  await seedAlert(request, account.uid, 'yesterday', { createdAt: yesterday.toISOString(), status: 'Reviewed' });
  await history(page);
  await expect(page.locator('.alert-row')).toHaveCount(24);
  const region = page.getByRole('region', { name: 'Scrollable alert history' });
  await region.focus();
  await page.keyboard.press('End');
  await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const date =
    yesterday.getFullYear() +
    '-' +
    String(yesterday.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(yesterday.getDate()).padStart(2, '0');
  await page.getByLabel('Date', { exact: true }).fill(date);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reviewed', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'All alerts', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(24);
  await page.getByRole('button', { name: 'All dates', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(25);
});

test('sign out clears history from view and another account has separate alerts', async ({
  page,
  request,
  account,
}) => {
  await seedAlert(request, account.uid, 'private-alert');
  await history(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await back(page);
  await settings(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.alert-row')).toHaveCount(0);
  await page.goto('/alert-history');
  await expect(page).toHaveURL(/\/login$/);
  const second = await createAccount(request);
  await logIn(page, second);
  await history(page);
  await expect(page.getByRole('heading', { name: 'No alerts yet' })).toBeVisible();
  expect(await savedCount(request, account.uid)).toBe(1);
});

test('offline review stays cached and syncs after reconnecting', async ({ page, context, request, account }) => {
  await seedAlert(request, account.uid, 'offline-alert');
  await history(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.locator('.alert-status')).toHaveText('Reviewed');
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toContainText('Offline');
  await context.setOffline(false);
  await expect(page.getByText('Saving movement alerts to your account…', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.alert-status')).toHaveText('Reviewed');
});

test('settings retain values, pages reflow, and deletion works with keyboard', async ({ page, request, account }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await seedAlert(request, account.uid, 'layout-alert');
  await settings(page);
  await page.getByLabel('Movement sensitivity').selectOption({ label: 'Low · larger movements' });
  await page.getByRole('switch', { name: 'Vibrate on alert' }).click();
  await back(page);
  await settings(page);
  await expect(page.getByLabel('Movement sensitivity').locator('option:checked')).toHaveText('Low · larger movements');
  await expect(page.getByRole('switch', { name: 'Vibrate on alert' })).not.toBeChecked();
  for (const path of ['/home', '/settings', '/alert-history']) {
    await page.goto(path);
    for (const width of [320, 393, 620, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const content = page.locator('ion-content .inner-scroll');
      await expect(content).toBeVisible();
      expect(await content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    }
  }
  await page.getByRole('button', { name: 'Delete', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('missing sensor readings and denied permission show actionable errors', async ({ page }) => {
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No motion readings arrived', { timeout: 8000 });
  await page.evaluate(() => {
    Object.defineProperty(DeviceMotionEvent, 'requestPermission', {
      configurable: true,
      value: () => Promise.resolve('denied'),
    });
  });
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Motion permission was denied');
});
