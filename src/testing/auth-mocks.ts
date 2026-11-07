import { signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { vi } from 'vitest';

import type { AccountUser } from '../app/auth/auth.service';

export function mockAuth(uid = 'user-a'): {
  user: WritableSignal<AccountUser | null>;
  initialized: WritableSignal<boolean>;
  error: WritableSignal<string>;
  ready: Promise<void>;
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  getToken: ReturnType<typeof vi.fn>;
  expireLogin: ReturnType<typeof vi.fn>;
} {
  return {
    user: signal<AccountUser | null>({ uid, email: uid + '@example.com' }),
    initialized: signal(true),
    error: signal(''),
    ready: Promise.resolve(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn().mockResolvedValue('test-token'),
    expireLogin: vi.fn(),
  };
}
