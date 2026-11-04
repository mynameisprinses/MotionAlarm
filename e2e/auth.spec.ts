import { test, expect } from '@playwright/test';

import { createAccount } from './firebase';

test('registration validates confirmation, restores login after reload, and password reset works', async ({ page }) => {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(crypto.randomUUID() + '@example.com');
  await page.getByLabel('Password', { exact: true }).fill('MotionAlarm123!');
  await page.getByLabel('Confirm password').fill('Different123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.');
  await page.getByLabel('Confirm password').fill('MotionAlarm123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
  await page.getByLabel('Open settings').click();
  const email = await page.locator('.account-email').textContent();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email!.trim());
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('password reset link');
  await page.getByRole('button', { name: 'Back to login' }).click();
  await expect(page.getByRole('heading', { name: 'Log in to MotionAlarm' })).toBeVisible();
});

test('login reports wrong credentials and duplicate registration', async ({ page, request }) => {
  const account = await createAccount(request);
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByLabel('Confirm password').fill(account.password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already has an account');
});

test('login forms fit narrow screens, scroll on short screens, and support keyboard input', async ({ page }) => {
  await page.goto('/login');
  for (const width of [320, 393, 620, 768, 1280]) {
    await page.setViewportSize({ width, height: 500 });
    const content = page.locator('ion-content .inner-scroll');
    expect(await content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  }
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 420 });
  await page.getByLabel('Email', { exact: true }).focus();
  await page.keyboard.type('keyboard@example.com');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Forgot password?' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/login-mobile.png' });
});
