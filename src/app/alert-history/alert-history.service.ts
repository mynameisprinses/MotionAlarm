import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import type { MovementAlert } from '../home/movement-alert';
import { NATIVE_ALARM } from '../home/native-alarm';

@Injectable({ providedIn: 'root' })
export class AlertHistoryService {
  alerts: MovementAlert[] = [];
  loadingHistory = true;
  storageError = '';
  nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  private readonly storageKey = 'motion-alarm-alerts';
  private nativeAlarm = inject(NATIVE_ALARM);
  private storageReadFailed = false;
  private initialized = false;

  constructor() {
    this.loadAlerts();
    if (!this.nativeAndroid) {
      this.loadingHistory = false;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.nativeAndroid && !this.storageReadFailed) {
      await this.nativeAlarm.importHistory({ alerts: this.alerts });
    }
    this.initialized = true;
  }

  async refresh(): Promise<void> {
    if (!this.nativeAndroid) {
      return;
    }
    try {
      await this.initialize();
      const snapshot = await this.nativeAlarm.getState();
      this.replaceNativeAlerts(snapshot.alerts);
    } catch (error) {
      this.storageError = 'Could not read Android alert history.';
      if (error instanceof Error) {
        this.storageError = error.message;
      }
    } finally {
      this.loadingHistory = false;
    }
  }

  replaceNativeAlerts(alerts: MovementAlert[]): void {
    this.alerts = alerts;
    this.loadingHistory = false;
    if (!this.storageReadFailed) {
      this.storageError = '';
    }
  }

  get newAlertCount(): number {
    let count = 0;
    for (const alert of this.alerts) {
      if (alert.status === 'New') {
        count++;
      }
    }
    return count;
  }

  // CREATE: both the browser sensor and the test button use this function.
  createAlert(source: 'Movement' | 'Test', strength: number | null): void {
    const alert: MovementAlert = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source,
      status: 'New',
      strength,
    };
    this.alerts.unshift(alert);
    this.saveAlerts();
  }

  // READ: load once so both pages use the same array, including unsaved alerts.
  private loadAlerts(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed)) {
          throw new Error('Invalid history');
        }
        for (const alert of parsed) {
          if (!this.isValidAlert(alert)) {
            throw new Error('Invalid alert');
          }
        }
        this.alerts = parsed;
      }
    } catch {
      this.storageReadFailed = true;
      this.storageError =
        'Saved history could not be read. Clear history on the Alert history page to reset it. New alerts stay in memory until then.';
    }
  }

  private isValidAlert(value: unknown): value is MovementAlert {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const alert = value as MovementAlert;
    if (typeof alert.id !== 'string') {
      return false;
    }
    if (typeof alert.createdAt !== 'string' || !Number.isFinite(Date.parse(alert.createdAt))) {
      return false;
    }
    if (alert.source !== 'Movement' && alert.source !== 'Test') {
      return false;
    }
    if (alert.status !== 'New' && alert.status !== 'Reviewed') {
      return false;
    }
    if (alert.strength !== null) {
      if (typeof alert.strength !== 'number') {
        return false;
      }
      if (!Number.isFinite(alert.strength) || alert.strength < 0) {
        return false;
      }
    }
    return true;
  }

  private saveAlerts(): void {
    // Preserve unreadable data until the user explicitly clears history.
    if (this.storageReadFailed) {
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.alerts));
      this.storageError = '';
    } catch {
      this.storageError =
        'Changes are only kept in memory because device storage could not be written. Free some storage and try again before closing the app.';
    }
  }

  // UPDATE: change one status and save the array again.
  async toggleStatus(alert: MovementAlert): Promise<void> {
    let status: 'New' | 'Reviewed';
    if (alert.status === 'New') {
      status = 'Reviewed';
    } else {
      status = 'New';
    }
    if (this.nativeAndroid) {
      const snapshot = await this.nativeAlarm.updateAlert({ id: alert.id, status });
      this.replaceNativeAlerts(snapshot.alerts);
      return;
    }
    alert.status = status;
    this.saveAlerts();
  }

  // DELETE: find the ID and remove one item.
  async deleteAlert(id: string): Promise<void> {
    if (this.nativeAndroid) {
      const snapshot = await this.nativeAlarm.deleteAlert({ id });
      this.replaceNativeAlerts(snapshot.alerts);
      return;
    }
    for (let i = 0; i < this.alerts.length; i++) {
      if (this.alerts[i].id === id) {
        this.alerts.splice(i, 1);
        break;
      }
    }
    this.saveAlerts();
  }

  async clearHistory(): Promise<void> {
    if (this.nativeAndroid) {
      const snapshot = await this.nativeAlarm.clearAlerts();
      this.replaceNativeAlerts(snapshot.alerts);
    }
    localStorage.removeItem(this.storageKey);
    this.alerts = [];
    this.storageError = '';
    this.storageReadFailed = false;
  }
}
