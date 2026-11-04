import { InjectionToken } from '@angular/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

import type { MovementAlert } from './movement-alert';

export interface NativeAlarmState {
  state: 'idle' | 'countdown' | 'armed' | 'alert';
  countdown: number;
  strength: number;
  message: string;
  alerts: MovementAlert[];
  historyOwner?: string;
  threshold?: number;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
}

interface NativeAlarmPlugin {
  start(options: { threshold: number; soundEnabled: boolean; vibrationEnabled: boolean }): Promise<void>;
  stop(): Promise<NativeAlarmState>;
  getState(): Promise<NativeAlarmState>;
  setHistoryOwner(options: { userId: string }): Promise<void>;
  importHistory(options: { alerts: MovementAlert[] }): Promise<void>;
  createTestAlert(options: { soundEnabled: boolean }): Promise<NativeAlarmState>;
  updateAlert(options: { id: string; status: 'New' | 'Reviewed' }): Promise<NativeAlarmState>;
  deleteAlert(options: { id: string; userId?: string }): Promise<NativeAlarmState>;
  clearAlerts(): Promise<NativeAlarmState>;
  addListener(event: 'stateChanged', listener: () => void): Promise<PluginListenerHandle>;
}

export const NativeAlarm = registerPlugin<NativeAlarmPlugin>('MotionAlarm');

export const NATIVE_ALARM = new InjectionToken<NativeAlarmPlugin>('MotionAlarm', {
  providedIn: 'root',
  factory: () => NativeAlarm,
});
