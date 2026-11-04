import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, inject } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import type { AccelListenerEvent } from '@capacitor/motion';
import { Motion } from '@capacitor/motion';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { settingsOutline, shieldCheckmarkOutline, shieldOutline, warningOutline } from 'ionicons/icons';

import { AlertHistoryService } from '../alert-history/alert-history.service';
import { AlarmSettingsService } from '../settings/alarm-settings.service';

import { AlarmSound } from './alarm-sound';
import { NATIVE_ALARM } from './native-alarm';
import type { NativeAlarmState } from './native-alarm';

// Some iPhones require permission from a button tap before sending motion events.
type MotionPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [DecimalPipe, RouterLink, IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar],
})
export class HomePage implements OnInit, OnDestroy {
  history = inject(AlertHistoryService);
  settings = inject(AlarmSettingsService);
  countdown = 5;
  nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  nativeReady = false;
  strength = 0;
  sensorError = '';
  feedback = '';
  isDisarming = false;
  disarmError = '';

  private changeDetector = inject(ChangeDetectorRef);
  private motionListener: PluginListenerHandle | null = null;
  private countdownTimer: number | null = null;
  private sensorReady = false;
  private destroyed = false;
  private baselineX = 0;
  private baselineY = 0;
  private baselineZ = 0;
  private alarmSound = new AlarmSound();
  private nativeAlarm = inject(NATIVE_ALARM);
  private nativeListener: PluginListenerHandle | null = null;

  constructor() {
    addIcons({ settingsOutline, shieldCheckmarkOutline, shieldOutline, warningOutline });
  }

  ngOnInit(): void {
    if (this.nativeAndroid) {
      void this.initializeNative();
    }
  }

  private async initializeNative(): Promise<void> {
    try {
      this.nativeListener = await this.nativeAlarm.addListener('stateChanged', () => {
        void this.refreshNativeState();
      });
      if (this.destroyed) {
        await this.nativeListener.remove();
        return;
      }
      await this.history.initialize();
      await this.refreshNativeState();
    } catch (error) {
      this.sensorError = this.errorMessage(error, 'Could not connect to Android background monitoring.');
      // Restore an older active session so it can be stopped before switching account ownership.
      await this.refreshNativeState();
    } finally {
      this.nativeReady = true;
      this.history.loadingHistory = false;
      this.changeDetector.markForCheck();
    }
  }

  private applyNativeState(snapshot: NativeAlarmState): void {
    if (this.destroyed) {
      return;
    }
    this.settings.applyNativeSettings(snapshot);
    this.countdown = snapshot.countdown;
    this.strength = snapshot.strength;
    this.history.replaceNativeAlerts(snapshot.alerts, snapshot.historyOwner);
    this.sensorError = snapshot.message;
    this.changeDetector.markForCheck();
  }

  private async refreshNativeState(): Promise<void> {
    try {
      const snapshot = await this.nativeAlarm.getState();
      this.applyNativeState(snapshot);
    } catch (error) {
      this.history.storageError = this.errorMessage(error, 'Could not read Android alert history.');
      this.changeDetector.markForCheck();
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
      return error.message;
    }
    return fallback;
  }

  async startMonitoring(): Promise<void> {
    if (this.settings.state !== 'idle' || this.isDisarming) {
      return;
    }
    this.sensorError = '';
    this.feedback = '';
    this.disarmError = '';

    if (this.nativeAndroid) {
      await this.startAndroidMonitoring();
    } else {
      await this.startBrowserMonitoring();
    }
  }

  private async startAndroidMonitoring(): Promise<void> {
    if (!this.nativeReady) {
      return;
    }
    this.settings.state = 'starting';
    try {
      await this.history.initialize();
      await this.nativeAlarm.start({
        threshold: this.settings.threshold,
        soundEnabled: this.settings.soundEnabled,
        vibrationEnabled: this.settings.vibrationEnabled,
      });
      await this.refreshNativeState();
    } catch (error) {
      this.settings.state = 'idle';
      this.sensorError = this.errorMessage(error, 'Could not start Android background monitoring.');
    }
    this.changeDetector.markForCheck();
  }

  private async startBrowserMonitoring(): Promise<void> {
    if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') {
      this.sensorError =
        'Motion needs a supported phone and a secure connection (HTTPS or the installed app). You can still create a test alert below.';
      return;
    }

    this.settings.state = 'starting';
    try {
      await this.requestBrowserAccess();

      if (this.destroyed || document.hidden || this.settings.state !== 'starting') {
        this.settings.state = 'idle';
        return;
      }

      this.sensorReady = false;
      this.strength = 0;
      this.motionListener = await Motion.addListener('accel', (event) => {
        this.checkMovement(event);
      });

      if (this.destroyed || document.hidden || this.settings.state !== 'starting') {
        await this.stopMonitoring();
        return;
      }

      this.startCountdown();
    } catch (error) {
      await this.stopMonitoring();
      this.sensorError = this.errorMessage(error, 'Could not start the motion sensor. Check permission and try again.');
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private async requestBrowserAccess(): Promise<void> {
    const motionEvent = DeviceMotionEvent as MotionPermission;
    let motionPermission = Promise.resolve('granted');
    let soundPermission = Promise.resolve();

    // Phones need both requests to start during the same button tap, before either await.
    if (typeof motionEvent.requestPermission === 'function') {
      motionPermission = motionEvent.requestPermission();
    }
    if (this.settings.soundEnabled) {
      soundPermission = this.alarmSound.prepare();
    }

    const results = await Promise.all([motionPermission, soundPermission]);
    const permission = results[0];
    if (permission !== 'granted') {
      throw new Error(
        'Motion permission was denied. Allow Motion & Orientation in your browser settings, then arm again.',
      );
    }
  }

  private startCountdown(): void {
    this.countdown = 5;
    this.settings.state = 'countdown';
    this.countdownTimer = window.setInterval(() => {
      this.updateCountdown();
    }, 1000);
  }

  private updateCountdown(): void {
    this.countdown--;
    if (this.countdown === 0) {
      this.clearCountdown();
      if (this.sensorReady) {
        this.settings.state = 'armed';
      } else {
        void this.stopMonitoring();
        this.sensorError =
          'No motion readings arrived. Try a supported phone, check sensor permission, and arm again. Test alerts work without a sensor.';
      }
    }
    // Timers and sensor callbacks must notify Angular's zoneless change detection.
    this.changeDetector.markForCheck();
  }

  private checkMovement(event: AccelListenerEvent): void {
    if (this.settings.state !== 'starting' && this.settings.state !== 'countdown' && this.settings.state !== 'armed') {
      return;
    }

    const sample = event.accelerationIncludingGravity;
    if (!sample) {
      return;
    }
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.z)) {
      return;
    }

    this.sensorReady = true;
    if (this.settings.state === 'countdown' || this.settings.state === 'starting') {
      // Remember the resting position. Keep this baseline fixed after arming.
      this.baselineX = sample.x;
      this.baselineY = sample.y;
      this.baselineZ = sample.z;
      return;
    }

    const x = sample.x - this.baselineX;
    const y = sample.y - this.baselineY;
    const z = sample.z - this.baselineZ;
    this.strength = Math.sqrt(x * x + y * y + z * z);

    if (this.strength >= this.settings.threshold) {
      this.triggerBrowserAlarm();
    }
    this.changeDetector.markForCheck();
  }

  private triggerBrowserAlarm(): void {
    // Change state first so the next sensor event cannot create another alert.
    this.settings.state = 'alert';
    this.history.createAlert('Movement', this.strength);
    void this.vibratePhone();
    if (this.settings.soundEnabled) {
      try {
        this.alarmSound.start();
      } catch (error) {
        this.feedback = this.errorMessage(error, 'The alarm sound could not start.');
      }
    }
  }

  async stopMonitoring(): Promise<void> {
    if (this.nativeAndroid) {
      if (this.isDisarming) {
        return;
      }
      this.isDisarming = true;
      this.disarmError = '';
      this.changeDetector.markForCheck();
      try {
        const snapshot = await this.nativeAlarm.stop();
        this.applyNativeState(snapshot);
      } catch (error) {
        this.disarmError = this.errorMessage(error, 'Verification did not finish. Tap Motion alarm stop to try again.');
      } finally {
        this.isDisarming = false;
        this.changeDetector.markForCheck();
      }
      return;
    }
    this.alarmSound.stop();
    this.clearCountdown();
    this.settings.state = 'idle';
    this.strength = 0;
    const listener = this.motionListener;
    this.motionListener = null;
    if (listener) {
      try {
        await listener.remove();
      } catch {
        this.sensorError = 'The sensor could not be released. Reload the app before arming again.';
      }
    }
    this.changeDetector.markForCheck();
  }

  private clearCountdown(): void {
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  async createTestAlert(): Promise<void> {
    if (this.settings.state !== 'idle' || this.isDisarming) {
      return;
    }
    if (this.nativeAndroid) {
      try {
        const snapshot = await this.nativeAlarm.createTestAlert({ soundEnabled: this.settings.soundEnabled });
        this.applyNativeState(snapshot);
      } catch (error) {
        this.history.storageError = this.errorMessage(error, 'Could not create the Android test alert.');
        this.changeDetector.markForCheck();
        return;
      }
    } else {
      if (this.settings.soundEnabled) {
        try {
          await this.alarmSound.prepare();
          this.alarmSound.start(true);
        } catch (error) {
          this.sensorError = this.errorMessage(error, 'The test alarm sound could not start.');
        }
      }
    }
    this.feedback = 'Test alarm started. No alert was saved.';
    await this.vibratePhone();
    this.changeDetector.markForCheck();
  }

  private async vibratePhone(): Promise<void> {
    if (!this.settings.vibrationEnabled) {
      return;
    }
    try {
      await Haptics.vibrate({ duration: 1000 });
    } catch {
      this.feedback = this.feedback
        ? this.feedback + ' Vibration is unavailable on this device.'
        : 'Movement detected, but vibration is unavailable on this device.';
      this.changeDetector.markForCheck();
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (this.nativeAndroid) {
      if (!document.hidden) {
        void this.refreshNativeState();
      }
      return;
    }
    if (document.hidden) {
      this.alarmSound.stop();
    }
    if (document.hidden && this.settings.state !== 'idle') {
      void this.stopMonitoring();
      this.sensorError = 'Monitoring stopped when the app left the screen. Keep MotionAlarm open and arm again.';
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.alarmSound.dispose();
    if (this.nativeListener) {
      void this.nativeListener.remove();
    }
    if (!this.nativeAndroid) {
      void this.stopMonitoring();
    }
  }
}
