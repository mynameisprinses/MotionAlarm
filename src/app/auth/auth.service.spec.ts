import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';

import { ApiError, ApiService } from '../api/api-request';
import { NATIVE_ALARM } from '../home/native-alarm';

import { AuthService, authErrorMessage } from './auth.service';
import type { LoginSession } from './auth.service';

const apiRequest = vi.fn();
const session: LoginSession = {
  user: { uid: 'user-a', email: 'a@example.com' },
  idToken: 'token-a',
  refreshToken: 'refresh-a',
  expiresAt: Date.now() + 3600000,
};

describe('REST login sessions', () => {
  it('explains how to resolve missing Firebase Authentication configuration', () => {
    const message = authErrorMessage(
      new ApiError(400, 'CONFIGURATION_NOT_FOUND', 'Firebase could not complete the request.'),
    );
    expect(message).toContain('Authentication is not set up');
    expect(message).toContain('enable Email/Password');
  });
  beforeEach(() => {
    apiRequest.mockReset();
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
    vi.mocked(apiRequest).mockResolvedValue(session);
    const auth = TestBed.inject(AuthService);
    await auth.login(' a@example.com ', 'password');
    expect(apiRequest).toHaveBeenCalledWith('/auth/login', 'POST', { email: 'a@example.com', password: 'password' });
    expect(auth.user()?.uid).toBe('user-a');
    expect(JSON.parse(localStorage.getItem('motion-alarm-login')!).idToken).toBe('token-a');
    expect(await auth.getToken('user-a')).toBe('token-a');
  });

  it('shares one refresh request between concurrent API operations', async () => {
    localStorage.setItem('motion-alarm-login', JSON.stringify({ ...session, expiresAt: 0 }));
    vi.mocked(apiRequest).mockResolvedValue({ ...session, idToken: 'fresh-token' });
    const auth = TestBed.inject(AuthService);
    expect(await Promise.all([auth.getToken('user-a'), auth.getToken('user-a')])).toEqual([
      'fresh-token',
      'fresh-token',
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/auth/refresh', 'POST', { refreshToken: 'refresh-a' });
  });

  it('retains the login during a network failure, but clears rejected refresh tokens', async () => {
    localStorage.setItem('motion-alarm-login', JSON.stringify({ ...session, expiresAt: 0 }));
    const auth = TestBed.inject(AuthService);
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Offline'));
    await expect(auth.getToken('user-a')).rejects.toThrow('Offline');
    expect(auth.user()?.uid).toBe('user-a');
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(400, 'INVALID_REFRESH_TOKEN', 'Expired'));
    await expect(auth.getToken('user-a')).rejects.toThrow('Expired');
    expect(auth.user()).toBeNull();
    expect(localStorage.getItem('motion-alarm-login')).toBeNull();
  });

  it('does not overwrite a new login with an older pending token refresh', async () => {
    localStorage.setItem('motion-alarm-login', JSON.stringify({ ...session, expiresAt: 0 }));
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
      ...session,
      user: { uid: 'user-b', email: 'b@example.com' },
      idToken: 'token-b',
    });
    await auth.login('b@example.com', 'password');
    finish(session);
    await rejected;
    expect(auth.user()?.uid).toBe('user-b');
    expect(await auth.getToken('user-b')).toBe('token-b');
  });
});
