import { expect, test, seedAlert } from './supabase';

test('short screens can scroll to the end of the monitor, Settings, and history', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  for (const viewport of [
    { width: 393, height: 420 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const screen of [
      { path: '/home', lastContent: 'app-home .test-section ion-button' },
      { path: '/settings', lastContent: 'app-settings .account-panel ion-button' },
      { path: '/alert-history', lastContent: 'app-alert-history .monitor-link' },
    ]) {
      await page.goto(screen.path);
      await page.locator('ion-content .inner-scroll').waitFor();
      await page.locator(screen.lastContent).waitFor({ state: 'visible' });
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, 2000);
      await expect(page.locator(screen.lastContent)).toBeInViewport({ ratio: 1 });
    }
  }

  expect(browserErrors).toEqual([]);
});

test('scrolling past the end of a long history list continues down the page', async ({ page, request, account }) => {
  await page.setViewportSize({ width: 393, height: 640 });
  for (let i = 0; i < 30; i++) await seedAlert(request, account.uid, 'scroll-' + i);
  await page.goto('/alert-history');
  const historyList = page.getByRole('region', { name: 'Scrollable alert history' });
  await expect(page.locator('.alert-row')).toHaveCount(30);
  const bounds = await historyList.boundingBox();
  if (bounds === null) {
    throw new Error('The alert history list is not visible.');
  }
  await page.mouse.move(bounds.x + bounds.width / 2, Math.min(bounds.y + 30, 600));
  await page.mouse.wheel(0, 10000);
  await expect
    .poll(() => historyList.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1))
    .toBe(true);
  await page.mouse.wheel(0, 2000);
  await expect(page.locator('.alert-row').last()).toBeInViewport({ ratio: 1 });
});
