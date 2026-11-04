import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export { expect };
export interface TestAccount {
  uid: string;
  email: string;
  password: string;
}

export async function createAccount(request: APIRequestContext): Promise<TestAccount> {
  const email = crypto.randomUUID() + '@example.com';
  const password = 'MotionAlarm123!';
  const response = await request.post('http://127.0.0.1:3001/api/auth/register', { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return { uid: (await response.json()).user.uid, email, password };
}

export async function logIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).last().click();
  await expect(page).toHaveURL(/\/home$/);
}

export async function seedAlert(
  request: APIRequestContext,
  uid: string,
  id: string,
  overrides: { createdAt?: string; status?: string; strength?: number } = {},
): Promise<void> {
  const response = await request.patch(
    'http://127.0.0.1:8080/v1/projects/demo-motion-alarm/databases/(default)/documents/users/' + uid + '/alerts/' + id,
    {
      headers: { Authorization: 'Bearer owner' },
      data: {
        fields: {
          id: { stringValue: id },
          createdAt: { stringValue: overrides.createdAt || new Date().toISOString() },
          source: { stringValue: 'Movement' },
          status: { stringValue: overrides.status || 'New' },
          strength: { doubleValue: overrides.strength ?? 2.5 },
        },
      },
    },
  );
  expect(response.ok()).toBeTruthy();
}

export async function savedCount(request: APIRequestContext, uid: string): Promise<number> {
  const response = await request.get(
    'http://127.0.0.1:8080/v1/projects/demo-motion-alarm/databases/(default)/documents/users/' + uid + '/alerts',
    { headers: { Authorization: 'Bearer owner' } },
  );
  expect(response.ok()).toBeTruthy();
  return ((await response.json()).documents || []).length;
}

export const test = base.extend<{ account: TestAccount }>({
  account: async ({ request }, use) => {
    await use(await createAccount(request));
  },
  page: async ({ page, account }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('NG0100')) errors.push(message.text());
    });
    await logIn(page, account);
    await use(page);
    expect(errors).toEqual([]);
  },
});
