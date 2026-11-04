import { inject, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { ApiError, ApiService } from '../api/api-request';
import { NATIVE_ALARM } from '../home/native-alarm';
import { AlarmSettingsService } from '../settings/alarm-settings.service';

export interface AccountUser {
  uid: string;
  email: string;
}
export interface LoginSession {
  user: AccountUser;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AccountUser | null>(null);
  readonly error = signal('');
  readonly initialized = signal(false);
  private readonly settings = inject(AlarmSettingsService);
  private readonly api = inject(ApiService);
  private readonly nativeAlarm = inject(NATIVE_ALARM);
  private readonly storageKey = 'motion-alarm-login';
  private session: LoginSession | null = null;
  private refreshing?: Promise<void>;

  readonly ready = Promise.resolve();

  constructor() {
    this.restoreLogin();
    window.addEventListener('storage', (event) => {
      if (event.key === this.storageKey) this.restoreLogin();
    });
  }

  async login(email: string, password: string): Promise<void> {
    this.saveLogin(await this.api.request<LoginSession>('/auth/login', 'POST', { email: email.trim(), password }));
  }

  async register(email: string, password: string): Promise<void> {
    this.saveLogin(await this.api.request<LoginSession>('/auth/register', 'POST', { email: email.trim(), password }));
  }

  async resetPassword(email: string): Promise<void> {
    await this.api.request('/auth/password-reset', 'POST', { email: email.trim() });
  }

  // Refresh expired tokens here so alert functions only need to ask for a token.
  async getToken(expectedUserId: string): Promise<string> {
    const session = this.session;
    if (!session || session.user.uid !== expectedUserId)
      throw new ApiError(401, 'SESSION_CHANGED', 'Log in to access your alerts.');
    if (session.expiresAt < Date.now() + 60000) {
      if (!this.refreshing) {
        this.refreshing = this.refreshLogin(session).finally(() => {
          this.refreshing = undefined;
        });
      }
      await this.refreshing;
    }
    if (!this.session || this.session.user.uid !== expectedUserId)
      throw new ApiError(401, 'SESSION_CHANGED', 'Your account changed. Reopen history and try again.');
    return this.session.idToken;
  }

  private async refreshLogin(session: LoginSession): Promise<void> {
    try {
      const refreshed = await this.api.request<LoginSession>('/auth/refresh', 'POST', {
        refreshToken: session.refreshToken,
      });
      if (this.session === session) {
        if (refreshed.user.uid !== session.user.uid) throw new ApiError(401, 'SESSION_CHANGED', 'Please log in again.');
        this.saveLogin(refreshed);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && this.session === session)
        this.forgetLogin();
      throw error;
    }
  }

  async logout(): Promise<void> {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      this.settings.applyNativeSettings(await this.nativeAlarm.getState());
    }
    if (this.settings.state !== 'idle') throw new Error('Stop the motion alarm on the monitor before signing out.');
    localStorage.removeItem(this.storageKey);
    this.session = null;
    this.user.set(null);
  }

  private saveLogin(session: LoginSession): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch {
      this.error.set('You are logged in for this session. This device could not remember your login.');
    }
    this.session = session;
    this.user.set(session.user);
  }

  private restoreLogin(): void {
    try {
      const value = localStorage.getItem(this.storageKey);
      const session = value ? (JSON.parse(value) as LoginSession) : null;
      if (
        session &&
        (typeof session.user?.uid !== 'string' ||
          !session.user.uid ||
          typeof session.user.email !== 'string' ||
          typeof session.idToken !== 'string' ||
          typeof session.refreshToken !== 'string' ||
          !Number.isFinite(session.expiresAt))
      )
        throw new Error('Invalid login');
      this.session = session;
      this.user.set(session?.user || null);
    } catch {
      this.session = null;
      this.user.set(null);
      this.error.set('Your saved login could not be read. Please log in again.');
    }
    this.initialized.set(true);
  }

  private forgetLogin(): void {
    this.session = null;
    this.user.set(null);
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* The current in-memory session is still cleared. */
    }
    this.error.set('Your login expired. Please log in again.');
  }

  expireLogin(uid: string): void {
    if (this.session?.user.uid === uid) this.forgetLogin();
  }
}

export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not complete the request. Please try again.';
  switch (error.code) {
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
      return 'Email or password is incorrect.';
    case 'EMAIL_EXISTS':
      return 'This email already has an account. Log in instead.';
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.';
    case 'WEAK_PASSWORD':
    case 'PASSWORD_DOES_NOT_MEET_REQUIREMENTS':
      return 'Choose a stronger password that meets your account password policy.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many attempts. Please wait and try again.';
    case 'OPERATION_NOT_ALLOWED':
      return 'Email/password login is not enabled in Firebase Authentication yet.';
    case 'USER_DISABLED':
      return 'This account has been disabled.';
    default:
      return error.message;
  }
}
