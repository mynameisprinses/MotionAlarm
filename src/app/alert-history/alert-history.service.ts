import { effect, inject, Injectable, signal } from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { ApiError, ApiService } from '../api/api-request';
import { AuthService } from '../auth/auth.service';
import type { MovementAlert } from '../home/movement-alert';
import { NATIVE_ALARM } from '../home/native-alarm';

type AlertChange =
  | { method: 'POST'; id: string; alert: MovementAlert }
  | { method: 'PATCH'; id: string; status: 'New' | 'Reviewed' }
  | { method: 'DELETE'; id: string };

@Injectable({ providedIn: 'root' })
export class AlertHistoryService implements OnDestroy {
  readonly nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  readonly offline = signal(!navigator.onLine);
  readonly showingCache = signal(true);
  private readonly savedAlerts = signal<MovementAlert[]>([]);
  private readonly nativePending = signal<MovementAlert[]>([]);
  private readonly pendingCount = signal(0);
  private readonly loading = signal(true);
  private readonly error = signal('');
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly nativeAlarm = inject(NATIVE_ALARM);
  private changes: AlertChange[] = [];
  private ownerId = '';
  private activeUid?: string;
  private initialization?: Promise<void>;
  private refreshing?: Promise<void>;
  private clearing = false;

  private readonly onOnline = () => {
    this.offline.set(false);
    void this.refresh();
  };
  private readonly onOffline = () => {
    this.offline.set(true);
    this.showingCache.set(true);
  };
  private readonly pollTimer = window.setInterval(() => {
    if (!document.hidden && this.auth.user()) void this.refresh();
  }, 5000);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (this.activeUid === (user?.uid || '')) return;
      this.activeUid = user?.uid || '';
      this.ownerId = '';
      this.initialization = undefined;
      this.refreshing = undefined;
      this.changes = [];
      this.pendingCount.set(0);
      this.savedAlerts.set([]);
      this.nativePending.set([]);
      this.error.set('');
      this.showingCache.set(true);
      this.loading.set(!!user);
      if (user) {
        this.loadCache(user.uid);
        void this.refresh();
      }
    });
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  get alerts(): MovementAlert[] {
    const alerts = [...this.savedAlerts()];
    for (const alert of this.nativePending()) {
      if (!alerts.some((saved) => saved.id === alert.id)) alerts.push(alert);
    }
    return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  get loadingHistory(): boolean {
    return this.loading();
  }
  set loadingHistory(value: boolean) {
    this.loading.set(value);
  }
  get storageError(): string {
    return this.error();
  }
  set storageError(value: string) {
    this.error.set(value);
  }
  get hasPendingWrites(): boolean {
    return this.pendingCount() > 0 || this.nativePending().length > 0;
  }
  get newAlertCount(): number {
    return this.alerts.filter((alert) => alert.status === 'New').length;
  }
  isNativePending(id: string): boolean {
    return this.nativePending().some((alert) => alert.id === id);
  }

  async initialize(): Promise<void> {
    await this.auth.ready;
    const uid = this.requireUser();
    if (this.ownerId === uid) return this.initialization;
    this.ownerId = uid;
    this.initialization = this.nativeAndroid ? this.nativeAlarm.setHistoryOwner({ userId: uid }) : Promise.resolve();
    try {
      await this.initialization;
    } catch (error) {
      if (this.ownerId === uid) this.ownerId = '';
      throw error;
    }
  }

  async refresh(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.clearing) return;
    if (this.refreshing) return this.refreshing;
    const refresh = this.syncUser(uid);
    this.refreshing = refresh;
    try {
      await refresh;
    } finally {
      if (this.refreshing === refresh) this.refreshing = undefined;
    }
  }

  private async syncUser(uid: string): Promise<void> {
    try {
      await this.initialize();
      if (!this.isCurrentUser(uid)) return;
      if (this.nativeAndroid) {
        const snapshot = await this.nativeAlarm.getState();
        if (!this.isCurrentUser(uid)) return;
        if (snapshot.historyOwner === uid) this.nativePending.set(snapshot.alerts.filter(isMovementAlert));
      }
      if (!navigator.onLine) return;

      // Send queued changes in order, removing each one only after the API accepts it.
      while (this.changes.length > 0 && this.isCurrentUser(uid)) {
        const change = this.changes[0];
        const token = await this.auth.getToken(uid);
        const path = change.method === 'POST' ? '/alerts' : '/alerts/' + change.id;
        const body =
          change.method === 'POST' ? change.alert : change.method === 'PATCH' ? { status: change.status } : undefined;
        try {
          await this.api.request(path, change.method, body, token);
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404 && change.method !== 'POST')) throw error;
        }
        if (!this.isCurrentUser(uid)) return;
        if (this.changes[0] !== change) return;
        this.changes.shift();
        this.saveCache(uid);
      }

      for (const alert of this.nativePending()) {
        const token = await this.auth.getToken(uid);
        await this.api.request('/alerts', 'POST', { ...alert, status: 'New' }, token);
        if (!this.isCurrentUser(uid)) return;
        await this.nativeAlarm.deleteAlert({ id: alert.id, userId: uid });
        if (!this.isCurrentUser(uid)) return;
        this.nativePending.update((pending) => pending.filter((item) => item.id !== alert.id));
      }

      const token = await this.auth.getToken(uid);
      const response = await this.api.request<{ alerts: MovementAlert[] }>('/alerts', 'GET', undefined, token);
      if (!this.isCurrentUser(uid)) return;
      // A new local change may have arrived while the list request was in progress.
      this.savedAlerts.set(this.applyChanges(response.alerts.filter(isMovementAlert), this.changes));
      this.showingCache.set(false);
      this.error.set('');
      this.saveCache(uid);
    } catch (error) {
      if (this.isCurrentUser(uid)) {
        this.showingCache.set(true);
        this.storageError = error instanceof Error ? error.message : 'Could not sync your alerts. Please try again.';
        if (error instanceof ApiError && error.status === 401) this.auth.expireLogin(uid);
      }
    } finally {
      if (this.isCurrentUser(uid)) this.loading.set(false);
    }
  }

  replaceNativeAlerts(alerts: MovementAlert[], historyOwner?: string): void {
    const uid = this.auth.user()?.uid;
    if (!uid || historyOwner !== uid || this.ownerId !== uid) return;
    this.nativePending.set(alerts.filter(isMovementAlert));
    void this.refresh();
  }

  createAlert(source: 'Movement' | 'Test', strength: number | null): void {
    if (source === 'Test') return;
    const alert: MovementAlert = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source,
      status: 'New',
      strength,
    };
    this.queueChange({ method: 'POST', id: alert.id, alert });
  }

  async toggleStatus(alert: MovementAlert): Promise<void> {
    if (this.isNativePending(alert.id)) throw new Error('Wait for this alert to sync before changing it.');
    this.queueChange({ method: 'PATCH', id: alert.id, status: alert.status === 'New' ? 'Reviewed' : 'New' });
    await this.refresh();
  }

  async deleteAlert(id: string): Promise<void> {
    if (this.isNativePending(id)) throw new Error('Wait for this alert to sync before changing it.');
    this.queueChange({ method: 'DELETE', id });
    await this.refresh();
  }

  async clearHistory(): Promise<void> {
    const uid = this.requireUser();
    await this.refresh();
    if (this.hasPendingWrites) throw new Error('Wait for your alerts to finish syncing before clearing history.');
    this.clearing = true;
    try {
      await this.api.request('/alerts', 'DELETE', undefined, await this.auth.getToken(uid));
      if (this.isCurrentUser(uid)) {
        this.savedAlerts.set([]);
        this.saveCache(uid);
      }
    } finally {
      this.clearing = false;
    }
    await this.refresh();
  }

  private queueChange(change: AlertChange): void {
    const uid = this.requireUser();
    this.changes.push(change);
    this.savedAlerts.set(this.applyChanges(this.savedAlerts(), [change]));
    this.saveCache(uid);
    void this.refresh();
  }

  private applyChanges(alerts: MovementAlert[], changes: AlertChange[]): MovementAlert[] {
    let result = [...alerts];
    for (const change of changes) {
      if (change.method === 'POST') {
        if (!result.some((alert) => alert.id === change.id)) result.unshift(change.alert);
      } else if (change.method === 'PATCH') {
        result = result.map((alert) => (alert.id === change.id ? { ...alert, status: change.status } : alert));
      } else {
        result = result.filter((alert) => alert.id !== change.id);
      }
    }
    return result;
  }

  private loadCache(uid: string): void {
    try {
      const saved = localStorage.getItem('motion-alarm-history-' + uid);
      if (!saved) return;
      const cache = JSON.parse(saved) as { alerts: unknown[]; changes: AlertChange[] };
      if (
        !Array.isArray(cache.alerts) ||
        !cache.alerts.every(isMovementAlert) ||
        !Array.isArray(cache.changes) ||
        !cache.changes.every(isAlertChange)
      )
        throw new Error('Invalid cache');
      this.savedAlerts.set(cache.alerts);
      this.changes = cache.changes;
      this.pendingCount.set(this.changes.length);
    } catch {
      this.storageError = 'Cached history could not be read. Reconnect to load your saved alerts.';
    }
  }

  private saveCache(uid: string): void {
    this.pendingCount.set(this.changes.length);
    try {
      localStorage.setItem(
        'motion-alarm-history-' + uid,
        JSON.stringify({ alerts: this.savedAlerts(), changes: this.changes }),
      );
    } catch {
      this.storageError = 'This device could not save offline changes. Keep the app open until syncing finishes.';
    }
  }

  private isCurrentUser(uid: string): boolean {
    return this.auth.user()?.uid === uid;
  }
  private requireUser(): string {
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Log in to access your alerts.');
    return uid;
  }

  ngOnDestroy(): void {
    window.clearInterval(this.pollTimer);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }
}

export function isMovementAlert(value: unknown): value is MovementAlert {
  if (typeof value !== 'object' || value === null) return false;
  const alert = value as MovementAlert;
  return (
    typeof alert.id === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(alert.id) &&
    typeof alert.createdAt === 'string' &&
    Number.isFinite(Date.parse(alert.createdAt)) &&
    alert.source === 'Movement' &&
    (alert.status === 'New' || alert.status === 'Reviewed') &&
    (alert.strength === null ||
      (typeof alert.strength === 'number' &&
        Number.isFinite(alert.strength) &&
        alert.strength >= 0 &&
        alert.strength <= 10000))
  );
}

function isAlertChange(value: unknown): value is AlertChange {
  if (typeof value !== 'object' || value === null) return false;
  const change = value as AlertChange;
  if (typeof change.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(change.id)) return false;
  if (change.method === 'POST')
    return isMovementAlert(change.alert) && change.alert.id === change.id && change.alert.status === 'New';
  if (change.method === 'PATCH') return change.status === 'New' || change.status === 'Reviewed';
  return change.method === 'DELETE';
}
