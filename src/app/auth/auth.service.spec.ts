import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';

import { environment } from '../../environments/environment';
import { ApiError, ApiService } from '../api/api-request';
import { NATIVE_ALARM } from '../home/native-alarm';

import { AuthService, authErrorMessage } from './auth.service';
import type { LoginSession } from './auth.service';

const apiRequest = vi.fn();
const session: LoginSession = {
  user: { uid: 'user-a', email: 'a@example.com' },
  accessToken: 'token-a',
  refreshToken: 'refresh-a',
  expiresAt: Date.now() + 3600000,
};

const storageKey = 'motion-alarm-supabase-login-' + environment.supabaseUrl;
const response = {
  user: { id: session.user.uid, email: session.user.email },
  access_token: session.accessToken,
  refresh_token: session.refreshToken,
  expires_in: 3600,
};

describe('REST login sessions', () => {
  it('explains email confirmation and disabled signups', () => {
    expect(authErrorMessage(new ApiError(400, 'email_not_confirmed', 'Not confirmed'))).toContain(
      'Contact the app owner',
    );
    expect(authErrorMessage(new ApiError(400, 'signup_disabled', 'Disabled'))).toContain('not enabled');
  });
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(response);
    localStorage.clear();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: { request: apiRequest } },
        { provide: NATIVE_ALARM, useValue: { getState: vi.fn().mockResolvedValue({ state: 'idle', alerts: [] }) } },
      ],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('logs in through the API and restores the saved session', async () => {
    vi.mocked(apiRequest).mockResolvedValue(response);
    const auth = TestBed.inject(AuthService);
    await auth.login(' a@example.com ', 'password');
    expect(apiRequest).toHaveBeenCalledWith('/auth/v1/token?grant_type=password', 'POST', {
      email: 'a@example.com',
      password: 'password',
    });
    expect(auth.user()?.uid).toBe('user-a');
    expect(JSON.parse(localStorage.getItem(storageKey)!).accessToken).toBe('token-a');
    expect(await auth.getToken('user-a')).toBe('token-a');
  });

  it('shares one refresh request between concurrent API operations', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ ...session, expiresAt: 0 }));
    vi.mocked(apiRequest).mockResolvedValue({ ...response, access_token: 'fresh-token' });
    const auth = TestBed.inject(AuthService);
    expect(await Promise.all([auth.getToken('user-a'), auth.getToken('user-a')])).toEqual([
      'fresh-token',
      'fresh-token',
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/auth/v1/token?grant_type=refresh_token', 'POST', {
      refresh_token: 'refresh-a',
    });
  });

  it('retains the login during a network failure, but clears rejected refresh tokens', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ ...session, expiresAt: 0 }));
    const auth = TestBed.inject(AuthService);
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Offline'));
    await expect(auth.getToken('user-a')).rejects.toThrow('Offline');
    expect(auth.user()?.uid).toBe('user-a');
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(400, 'refresh_token_not_found', 'Expired'));
    await expect(auth.getToken('user-a')).rejects.toThrow('Expired');
    expect(auth.user()).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('does not overwrite a new login with an older pending token refresh', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ ...session, expiresAt: 0 }));
    const auth = TestBed.inject(AuthService);
    let finish!: (value: unknown) => void;
    vi.mocked(apiRequest).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = auth.getToken('user-a');
    const rejected = expect(pending).rejects.toThrow('account changed');
    await auth.logout();
    vi.mocked(apiRequest).mockResolvedValueOnce({
      ...response,
      user: { id: 'user-b', email: 'b@example.com' },
      access_token: 'token-b',
    });
    await auth.login('b@example.com', 'password');
    finish(response);
    await rejected;
    expect(auth.user()?.uid).toBe('user-b');
    expect(await auth.getToken('user-b')).toBe('token-b');
  });

  it('avoids sending a signup request when email confirmation is enabled', async () => {
    apiRequest.mockResolvedValueOnce({ mailer_autoconfirm: false });
    const auth = TestBed.inject(AuthService);
    await expect(auth.register('a@example.com', 'password')).rejects.toMatchObject({
      code: 'email_confirmation_enabled',
    });
    expect(apiRequest.mock.calls).toEqual([['/auth/v1/settings']]);
    expect(auth.user()).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it.each([7, 49])('rejects a %i-character registration password before contacting Auth', async (length) => {
    const auth = TestBed.inject(AuthService);
    await expect(auth.register('demo@example.com', 'a'.repeat(length))).rejects.toMatchObject({
      code: 'invalid_password_length',
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it.each([8, 48])('registers with an email-shaped identifier and a %i-character password', async (length) => {
    apiRequest.mockResolvedValueOnce({ mailer_autoconfirm: true });
    const auth = TestBed.inject(AuthService);
    const password = 'a'.repeat(length);
    await auth.register('a@example.com', password);
    expect(apiRequest).toHaveBeenLastCalledWith('/auth/v1/signup', 'POST', { email: 'a@example.com', password });
    expect(auth.user()).toEqual(session.user);
  });

  it('does not restore a session from the previous account service', () => {
    localStorage.setItem('motion-alarm-login', JSON.stringify(session));
    expect(TestBed.inject(AuthService).user()).toBeNull();
  });
});
