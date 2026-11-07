import type { Page } from '@playwright/test';

import { expect, test, seedAlert } from './supabase';

async function expectTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
}

test('appearance follows the device and explicit choices survive navigation, reload and sign-out', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'dark');
  await page.getByLabel('Open settings').click();
  const appearance = page.getByLabel('Appearance', { exact: true });
  await expect(appearance).toHaveValue('system');
  await appearance.selectOption('light');
  await expectTheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'light');
  await page.reload();
  await expect(appearance).toHaveValue('light');
  await expectTheme(page, 'light');

  await appearance.selectOption('dark');
  await page.getByRole('button', { name: 'Back to monitor' }).click();
  await page.getByRole('link', { name: 'View alert history' }).click();
  await expectTheme(page, 'dark');
  await page.reload();
  await expectTheme(page, 'dark');
  await page.goto('/settings');
  await expect(appearance).toHaveValue('dark');
  await appearance.selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'light');
  await appearance.selectOption('dark');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expectTheme(page, 'dark');
  await page.reload();
  await expectTheme(page, 'dark');
});

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} mode covers forms, history, dialogs and responsive layouts`, async ({
    page,
    request,
    account,
  }, testInfo) => {
    await page.getByLabel('Open settings').click();
    const appearance = page.getByLabel('Appearance', { exact: true });
    await appearance.focus();
    await expect(appearance).toBeFocused();
    await expect(appearance).toHaveCSS('outline-style', 'solid');
    await appearance.selectOption(theme);
    await seedAlert(request, account.uid, 'theme-alert');

    for (const screen of [
      { path: '/home', panel: '.monitor-panel' },
      { path: '/settings', panel: '.settings-panel' },
      { path: '/alert-history', panel: '.history-panel' },
    ]) {
      await page.goto(screen.path);
      await expectTheme(page, theme);
      await expect(page.locator(screen.panel).first()).toHaveCSS(
        'background-color',
        theme === 'dark' ? 'rgb(29, 42, 34)' : 'rgb(255, 255, 255)',
      );
      for (const width of [320, 393, 620, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const content = page.locator('ion-content .inner-scroll');
        await expect(content).toBeVisible();
        expect(await content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
        if (width === 393 || width === 1440) {
          await page.screenshot({ path: testInfo.outputPath(`${screen.path.slice(1)}-${width}.png`) });
        }
      }
    }

    await page.getByRole('button', { name: 'Delete', exact: true }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('background-color', theme === 'dark' ? 'rgb(29, 42, 34)' : 'rgb(255, 255, 255)');
    await expect(dialog.locator('.alert-message')).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(179, 193, 183)' : 'rgb(94, 108, 99)',
    );
    await expect(dialog).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath('delete-dialog.png') });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.login-panel')).toBeVisible();
    await expectTheme(page, theme);
    await expect(page.getByLabel('Email', { exact: true })).toHaveCSS(
      'background-color',
      theme === 'dark' ? 'rgb(29, 42, 34)' : 'rgb(255, 255, 255)',
    );
    await page.screenshot({ path: testInfo.outputPath('login.png') });
  });
}

test('appearance stays available while monitoring settings are locked', async ({ page }) => {
  await page.evaluate(() => {
    setInterval(() => {
      window.dispatchEvent(
        new DeviceMotionEvent('devicemotion', {
          acceleration: { x: 0, y: 0, z: 0 },
          accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
          rotationRate: { alpha: 0, beta: 0, gamma: 0 },
          interval: 100,
        }),
      );
    }, 100);
  });
  await page.getByRole('button', { name: 'Motion alarm start', exact: true }).click();
  await page.getByLabel('Open settings').click();
  await expect(page.getByLabel('Movement sensitivity')).toBeDisabled();
  const appearance = page.getByLabel('Appearance', { exact: true });
  await expect(appearance).toBeEnabled();
  await appearance.selectOption('dark');
  await expectTheme(page, 'dark');
  await appearance.selectOption('light');
  await expectTheme(page, 'light');
  await page.getByRole('button', { name: 'Back to monitor' }).click();
  await page.getByRole('button', { name: 'Motion alarm stop', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
});
