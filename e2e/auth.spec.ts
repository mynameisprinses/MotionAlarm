import { test, expect } from '@playwright/test';

import { createAccount } from './firebase';

test('registration validates confirmation, restores login, and supports signing back in with visible passwords', async ({
  page,
}) => {
  const email = crypto.randomUUID() + '@example.com';
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('MotionAlarm123!');
  await page.getByLabel('Confirm password').fill('Different123!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.');
  await page.getByLabel('Confirm password').fill('MotionAlarm123!');
  await page.getByRole('checkbox', { name: 'Show passwords', exact: true }).check();
  const registration = page.waitForResponse(
    (response) => response.url().endsWith('/auth/register') && response.request().method() === 'POST',
    { timeout: 25_000 },
  );
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect((await registration).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/home$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Motion alarm start', exact: true })).toBeVisible();
  await page.getByLabel('Open settings').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('checkbox', { name: 'Show password', exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('MotionAlarm123!');
  await page.getByRole('checkbox', { name: 'Show password', exact: true }).check();
  const login = page.waitForResponse(
    (response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST',
    { timeout: 25_000 },
  );
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  expect((await login).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/home$/);
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

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} account forms show placeholders and accessible password controls without a reset option`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const email = page.getByLabel('Email', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    const confirmation = page.getByLabel('Confirm password', { exact: true });
    const showPassword = page.getByRole('checkbox', { name: 'Show password', exact: true });
    await expect(email).toHaveAttribute('placeholder', 'Enter your email address');
    await expect(password).toHaveAttribute('placeholder', 'Enter your password');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(showPassword).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
    await password.fill('VisiblePassword123!');
    await showPassword.focus();
    await expect(showPassword).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('VisiblePassword123!');
    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'password');
    await showPassword.check();
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    const showPasswords = page.getByRole('checkbox', { name: 'Show passwords', exact: true });
    await expect(password).toHaveValue('');
    await expect(password).toHaveAttribute('placeholder', 'Create a password');
    await expect(confirmation).toHaveAttribute('placeholder', 'Re-enter your password');
    await expect(showPasswords).not.toBeChecked();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(confirmation).toHaveAttribute('type', 'password');
    await password.fill('VisiblePassword123!');
    await confirmation.fill('VisiblePassword123!');
    await showPasswords.check();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(confirmation).toHaveAttribute('type', 'text');
    await expect(confirmation).toHaveValue('VisiblePassword123!');
    await showPasswords.uncheck();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(confirmation).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);

    for (const width of [320, 393, 620, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const content = page.locator('ion-content .inner-scroll');
      expect(await content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
      if (width === 393 || width === 1280) {
        await page.screenshot({ path: testInfo.outputPath(`register-${width}.png`) });
      }
    }
    await page.setViewportSize({ width: 320, height: 420 });
    await email.focus();
    await page.keyboard.type('keyboard@example.com');
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    const submit = page.getByRole('button', { name: 'Create account', exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    const touchTarget = await page.locator('.show-password-option').boundingBox();
    expect(touchTarget?.height).toBeGreaterThanOrEqual(44);
    await showPasswords.check();
    await page.getByRole('button', { name: 'Log in', exact: true }).first().click();
    await expect(showPassword).not.toBeChecked();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveValue('');
    await page.setViewportSize({ width: 393, height: 800 });
    await page.screenshot({ path: testInfo.outputPath('login-393.png') });
    expect(errors).toEqual([]);
  });
}
