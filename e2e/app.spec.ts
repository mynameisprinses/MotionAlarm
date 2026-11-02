import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

declare global {
  interface Window {
    motionSample: { x: number; y: number; z: number };
    sensorEvents: number;
    vibrationCalls: number;
    alarmSoundStarts: number;
    alarmSoundStops: number;
  }
}

let browserErrors: string[];

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.addInitScript(() => {
    window.vibrationCalls = 0;
    window.alarmSoundStarts = 0;
    window.alarmSoundStops = 0;
    const originalCreateOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = originalCreateOscillator.call(this);
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
      value: () => {
        window.vibrationCalls++;
        return true;
      },
      configurable: true,
    });
  });
});

test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});

async function startSensorSamples(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.motionSample = { x: 0, y: 0, z: 9.81 };
    window.sensorEvents = 0;
    window.setInterval(() => {
      window.dispatchEvent(
        new DeviceMotionEvent('devicemotion', {
          acceleration: { x: 0, y: 0, z: 0 },
          accelerationIncludingGravity: window.motionSample,
          rotationRate: { alpha: 0, beta: 0, gamma: 0 },
          interval: 100,
        }),
      );
      window.sensorEvents++;
    }, 100);
  });
}

async function openHistory(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'View alert history' }).click();
  await expect(page).toHaveURL(/\/alert-history$/);
  await expect(page.getByRole('heading', { name: /^Alert history/ })).toBeVisible();
  await expect(page.locator('app-home')).toBeHidden();
}

async function backToMonitor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back to monitor' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('app-alert-history')).toBeHidden();
  await expect(page.locator('app-settings')).toBeHidden();
}

async function openSettings(page: Page): Promise<void> {
  await page.getByLabel('Open settings', { exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('app-home')).toBeHidden();
}

async function savedAlertCount(page: Page): Promise<number> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('motion-alarm-alerts') || '[]').length);
}

test('create, filter, update, reload, delete, and clear alert history', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-home .history-panel')).toHaveCount(0);
  await openHistory(page);
  await expect(page.getByText('No alerts yet', { exact: true })).toBeVisible();
  await backToMonitor(page);
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(2);
  await page.locator('.alert-row').first().getByRole('button', { name: 'Mark reviewed' }).click();
  await page.getByRole('button', { name: 'Reviewed', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mark new', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No reviewed alerts' })).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.alert-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'All alerts', exact: true }).click();
  await page.locator('.alert-row').first().getByRole('button', { name: 'Mark reviewed' }).click();
  await page.reload();
  await expect(page.locator('.alert-row')).toHaveCount(2);
  await expect(page.locator('.alert-status.reviewed')).toHaveCount(1);

  await page.locator('.alert-row').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.alert-row')).toHaveCount(2);
  await page.locator('.alert-row').first().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('No alerts yet', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.alert-row')).toHaveCount(0);
  await backToMonitor(page);
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.alert-row')).toHaveCount(1);
});

test('motion arms after countdown, vibrates once, and saves one alert per session', async ({ page }) => {
  await page.goto('/');
  await startSensorSamples(page);
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Place your phone down' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create test alert', exact: true })).toBeDisabled();
  await openSettings(page);
  await expect(page.getByLabel('Movement sensitivity')).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Sound on alert' })).toBeDisabled();
  await backToMonitor(page);
  await expect(page.getByRole('heading', { name: 'Watching for movement' })).toBeVisible({ timeout: 8000 });
  expect(await savedAlertCount(page)).toBe(0);
  await page.evaluate(() => {
    window.motionSample = { x: 2.5, y: 0, z: 9.81 };
  });
  await expect(page.getByRole('heading', { name: 'Your phone moved' })).toBeVisible();
  expect(await savedAlertCount(page)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.vibrationCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.alarmSoundStarts)).toBe(1);
  const eventCount = await page.evaluate(() => window.sensorEvents);
  await expect.poll(() => page.evaluate(() => window.sensorEvents)).toBeGreaterThan(eventCount + 4);
  expect(await savedAlertCount(page)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.vibrationCalls)).toBe(1);
  await page.getByRole('button', { name: 'Motion alarm stop', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.alarmSoundStops)).toBe(1);
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Watching for movement' })).toBeVisible({ timeout: 8000 });
  expect(await savedAlertCount(page)).toBe(1);
  await page.getByRole('button', { name: 'Motion alarm stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
  await openHistory(page);
  await expect(page.getByRole('heading', { name: 'Phone movement detected' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.alert-row')).toHaveCount(1);
});

test('sensitivity and vibration controls change the actual sensor behavior', async ({ page }) => {
  await page.goto('/');
  await openSettings(page);
  await page.getByLabel('Movement sensitivity').selectOption({ label: 'High · small movements' });
  await page.getByRole('switch', { name: 'Vibrate on alert' }).click();
  await page.getByRole('switch', { name: 'Sound on alert' }).click();
  await backToMonitor(page);
  await startSensorSamples(page);
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Watching for movement' })).toBeVisible({ timeout: 8000 });
  await page.evaluate(() => {
    window.motionSample = { x: 1.1, y: 0, z: 9.81 };
  });
  await expect(page.getByRole('heading', { name: 'Your phone moved' })).toBeVisible();
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  expect(await page.evaluate(() => window.vibrationCalls)).toBe(0);
  expect(await page.evaluate(() => window.alarmSoundStarts)).toBe(0);
});

test('test alerts preview the alarm sound for two seconds', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.alarmSoundStarts)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.alarmSoundStops), { timeout: 5000 }).toBe(1);
  expect(await savedAlertCount(page)).toBe(1);
  await openSettings(page);
  await page.getByRole('switch', { name: 'Sound on alert' }).click();
  await backToMonitor(page);
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(2);
  expect(await page.evaluate(() => window.alarmSoundStarts)).toBe(1);
});

test('countdown can be canceled, and missing sensor readings never claim monitoring is on', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await page.getByRole('button', { name: 'Motion alarm stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No motion readings arrived', { timeout: 8000 });
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
  await expect(page.locator('.alert-row')).toHaveCount(0);
});

test('denied motion permission shows an actionable error', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceMotionEvent, 'requestPermission', {
      value: () => Promise.resolve('denied'),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Motion permission was denied');
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
});

test('unsupported devices can still create test alerts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'DeviceMotionEvent', { value: undefined });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Motion needs a supported phone');
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
});

test('corrupt history is preserved until explicitly cleared', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('motion-alarm-alerts', 'broken history'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Saved history could not be read');
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('motion-alarm-alerts'))).toBe('broken history');
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await backToMonitor(page);
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await openHistory(page);
  await page.reload();
  await expect(page.locator('.alert-row')).toHaveCount(1);
});

test('storage write failure keeps the alert visible and explains that it was not saved', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Changes are only kept in memory');
  await expect.poll(() => page.evaluate(() => window.vibrationCalls)).toBe(1);
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('Changes are only kept in memory');
});

test('leaving the app stops monitoring', async ({ page }) => {
  await page.goto('/');
  await startSensorSamples(page);
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await page.getByRole('button', { name: 'Motion alarm stop', exact: true }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.motionSample = { x: 10, y: 0, z: 9.81 };
  });
  await expect(page.getByRole('alert')).toContainText('Monitoring stopped when the app left the screen');
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
  await expect(page.locator('.alert-row')).toHaveCount(0);
});

async function checkResponsiveLayout(page: Page): Promise<void> {
  for (const width of [320, 393, 620, 768, 919, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => {
      const content = document.querySelector('ion-router-outlet > .ion-page:not(.ion-page-hidden) ion-content');
      const scrolling = content?.shadowRoot?.querySelector('.inner-scroll');
      if (!scrolling) return -1;
      return scrolling.scrollWidth - scrolling.clientWidth;
    });
    expect(overflow, 'horizontal overflow at ' + width + 'px').toBe(0);
    const smallTargets = await page.evaluate(() => {
      const activePage = document.querySelector('ion-router-outlet > .ion-page:not(.ion-page-hidden)');
      const controls = activePage?.querySelectorAll(
        'ion-button, ion-back-button, ion-toggle, .history-filters button, select, input:not([type="hidden"]), .history-link, .monitor-link',
      );
      const result: string[] = [];
      for (const control of controls || []) {
        const bounds = control.getBoundingClientRect();
        if (bounds.width < 44 || bounds.height < 44) result.push(control.textContent?.trim() || control.tagName);
      }
      return result;
    });
    expect(smallTargets, 'touch targets at ' + width + 'px').toEqual([]);
  }
}

test('layout reflows, the history link works, and dialogs support the keyboard', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await checkResponsiveLayout(page);
  await openHistory(page);
  await checkResponsiveLayout(page);
  await page.getByRole('button', { name: 'Delete', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  if (testInfo.project.name === 'Desktop Chrome') {
    await mkdir('docs/screenshots', { recursive: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: 'docs/screenshots/history-desktop.png' });
    await page.setViewportSize({ width: 393, height: 852 });
    await page.screenshot({ path: 'docs/screenshots/history-mobile.png' });
    await backToMonitor(page);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: 'docs/screenshots/desktop.png' });
    await page.setViewportSize({ width: 393, height: 1300 });
    await page.screenshot({ path: 'docs/screenshots/mobile.png' });
    await openSettings(page);
    await checkResponsiveLayout(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: 'docs/screenshots/settings-desktop.png' });
    await page.setViewportSize({ width: 393, height: 1000 });
    await page.screenshot({ path: 'docs/screenshots/settings-mobile.png' });
  }
});

test('history opens directly and its empty-state link returns to the monitor', async ({ page }) => {
  await page.goto('/alert-history');
  await expect(page.getByRole('heading', { name: 'No alerts yet' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to monitor' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole('button', { name: 'Create test alert', exact: true }).click();
  await openHistory(page);
  await expect(page.locator('.alert-row')).toHaveCount(1);
});

test('monitoring continues and new alerts appear while viewing history', async ({ page }) => {
  await page.goto('/');
  await startSensorSamples(page);
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Watching for movement' })).toBeVisible({ timeout: 8000 });
  await openHistory(page);
  await page.evaluate(() => {
    window.motionSample = { x: 2.5, y: 0, z: 9.81 };
  });
  await expect(page.getByRole('heading', { name: 'Phone movement detected' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.alarmSoundStarts)).toBe(1);
  await backToMonitor(page);
  await expect(page.getByRole('heading', { name: 'Your phone moved' })).toBeVisible();
  await page.getByRole('button', { name: 'Motion alarm stop', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.alarmSoundStops)).toBe(1);
});

test('history defaults to today, combines date and status filters, and scrolls through logs', async ({ page }) => {
  await page.goto('/');
  const dates = await page.evaluate(() => {
    const today = new Date();
    today.setHours(0, 30, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const alerts = [];
    for (let i = 0; i < 24; i++) {
      alerts.push({ id: 'today-' + i, createdAt: today.toISOString(), source: 'Test', status: 'New', strength: null });
    }
    alerts.push({
      id: 'yesterday',
      createdAt: yesterday.toISOString(),
      source: 'Movement',
      status: 'Reviewed',
      strength: 2.5,
    });
    localStorage.setItem('motion-alarm-alerts', JSON.stringify(alerts));
    function dateValue(date: Date): string {
      return (
        date.getFullYear() +
        '-' +
        String(date.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(date.getDate()).padStart(2, '0')
      );
    }
    return { today: dateValue(today), yesterday: dateValue(yesterday) };
  });
  await page.reload();
  await openHistory(page);
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(dates.today);
  await expect(page.locator('.alert-row')).toHaveCount(24);
  const historyList = page.getByRole('region', { name: 'Scrollable alert history' });
  await historyList.focus();
  await page.keyboard.press('End');
  await expect.poll(() => historyList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('.alert-row').last()).toBeInViewport();
  await page.getByLabel('Date', { exact: true }).fill(dates.yesterday);
  await expect(page.locator('.alert-row')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Phone movement detected' })).toBeVisible();
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

test('settings open from the top icon and retain selected values after returning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Movement sensitivity')).toHaveCount(0);
  await openSettings(page);
  await expect(page.getByText('Make it yours', { exact: true })).toHaveCount(0);
  await page.getByLabel('Movement sensitivity').selectOption({ label: 'Low · larger movements' });
  await page.getByRole('switch', { name: 'Sound on alert' }).click();
  await page.getByRole('switch', { name: 'Vibrate on alert' }).click();
  await backToMonitor(page);
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
  await openSettings(page);
  await expect(page.getByLabel('Movement sensitivity').locator('option:checked')).toHaveText('Low · larger movements');
  await expect(page.getByRole('switch', { name: 'Sound on alert' })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Vibrate on alert' })).not.toBeChecked();
  await checkResponsiveLayout(page);
});
