import { inject, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { environment } from '../../environments/environment';
import { ApiError, ApiService } from '../api/api-request';
import { NATIVE_ALARM } from '../home/native-alarm';
import { AlarmSettingsService } from '../settings/alarm-settings.service';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 48;

export interface AccountUser {
  uid: string;
  email: string;
}
export interface LoginSession {
  user: AccountUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthResponse {
  user?: { id: string; email?: string };
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AccountUser | null>(null);
  readonly error = signal('');
  readonly initialized = signal(false);
  private readonly settings = inject(AlarmSettingsService);
  private readonly api = inject(ApiService);
  private readonly nativeAlarm = inject(NATIVE_ALARM);
  private readonly storageKey = 'motion-alarm-supabase-login-' + environment.supabaseUrl;
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
    const response = await this.api.request<AuthResponse>('/auth/v1/token?grant_type=password', 'POST', {
      email: email.trim(),
      password,
    });
    this.saveLogin(this.readSession(response));
  }

  async register(email: string, password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new ApiError(400, 'invalid_password_length', 'Enter a password between 8 and 48 characters.');
    }

    const settings = await this.api.request<{ mailer_autoconfirm: boolean }>('/auth/v1/settings');
    if (!settings.mailer_autoconfirm) {
      throw new ApiError(
        503,
        'email_confirmation_enabled',
        'Registration is unavailable until the app owner turns off email confirmation.',
      );
    }

    const response = await this.api.request<AuthResponse>('/auth/v1/signup', 'POST', { email: email.trim(), password });
    this.saveLogin(this.readSession(response));
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
    return this.session.accessToken;
  }

  private async refreshLogin(session: LoginSession): Promise<void> {
    try {
      const response = await this.api.request<AuthResponse>('/auth/v1/token?grant_type=refresh_token', 'POST', {
        refresh_token: session.refreshToken,
      });
      const refreshed = this.readSession(response);
      if (this.session === session) {
        if (refreshed.user.uid !== session.user.uid) throw new ApiError(401, 'SESSION_CHANGED', 'Please log in again.');
        this.saveLogin(refreshed);
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429 &&
        this.session === session
      )
        this.forgetLogin();
      throw error;
    }
  }

  async logout(): Promise<void> {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      this.settings.applyNativeSettings(await this.nativeAlarm.getState());
    }
    if (this.settings.state !== 'idle') throw new Error('Stop the motion alarm on the monitor before signing out.');
    if (this.session && navigator.onLine) {
      try {
        await this.api.request('/auth/v1/logout?scope=local', 'POST', undefined, this.session.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError && (error.status === 0 || error.status === 401))) throw error;
      }
    }
    localStorage.removeItem(this.storageKey);
    this.session = null;
    this.user.set(null);
  }

  private saveLogin(session: LoginSession): void {
    this.error.set('');
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch {
      this.error.set('You are logged in for this session. This device could not remember your login.');
    }
    this.session = session;
    this.user.set(session.user);
  }

  private readSession(response: AuthResponse): LoginSession {
    if (!response.user?.id || !response.access_token || !response.refresh_token || !response.expires_in) {
      throw new ApiError(502, 'INVALID_SESSION', 'Could not read your login. Please try again.');
    }
    return {
      user: { uid: response.user.id, email: response.user.email || '' },
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    };
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
          typeof session.accessToken !== 'string' ||
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
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'user_already_exists':
    case 'email_exists':
      return 'This email already has an account. Log in instead.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Enter a valid email address.';
    case 'weak_password':
      return 'Choose a stronger password that meets your account password policy.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Please wait and try again.';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Email/password accounts are not enabled. Please contact the app owner.';
    case 'email_not_confirmed':
      return 'This account is awaiting verification. Contact the app owner for help signing in.';
    case 'user_banned':
      return 'This account has been disabled.';
    default:
      return error.message;
  }
}
