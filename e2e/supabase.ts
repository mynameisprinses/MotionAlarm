import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

export { expect };
export interface TestAccount {
  uid: string;
  email: string;
  password: string;
  token: string;
}

const accounts = new Map<string, TestAccount>();
const baseUrl = 'http://127.0.0.1:54321';
const apikey = 'sb_publishable_test_only';

export async function createAccount(request: APIRequestContext): Promise<TestAccount> {
  const email = crypto.randomUUID() + '@example.com';
  const password = 'MotionAlarm123!';
  const response = await request.post(baseUrl + '/auth/v1/signup', { headers: { apikey }, data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  const account = { uid: data.user.id, email, password, token: data.access_token };
  accounts.set(account.uid, account);
  return account;
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
  const headers = { apikey, Authorization: 'Bearer ' + accounts.get(uid)!.token };
  const response = await request.post(baseUrl + '/rest/v1/rpc/record_movement_alert', {
    headers,
    data: {
      p_id: id,
      p_created_at: overrides.createdAt || new Date().toISOString(),
      p_strength: overrides.strength ?? 2.5,
    },
  });
  expect(response.ok()).toBeTruthy();
  if (overrides.status) {
    const update = await request.patch(baseUrl + '/rest/v1/alerts?id=eq.' + id, {
      headers,
      data: { status: overrides.status },
    });
    expect(update.ok()).toBeTruthy();
  }
}

export async function savedCount(request: APIRequestContext, uid: string): Promise<number> {
  const response = await request.get(baseUrl + '/rest/v1/alerts', {
    headers: { apikey, Authorization: 'Bearer ' + accounts.get(uid)!.token },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).length;
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
