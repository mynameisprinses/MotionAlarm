import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToggle, IonToolbar } from '@ionic/angular';

import { NATIVE_ALARM } from '../home/native-alarm';

import { AlarmSettingsService } from './alarm-settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [FormsModule, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToggle, IonToolbar],
})
export class SettingsPage implements OnInit, OnDestroy {
  settings = inject(AlarmSettingsService);
  nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  ready = !this.nativeAndroid;
  error = '';

  private nativeAlarm = inject(NATIVE_ALARM);
  private changeDetector = inject(ChangeDetectorRef);
  private nativeListener: PluginListenerHandle | null = null;
  private destroyed = false;

  async ngOnInit(): Promise<void> {
    if (!this.nativeAndroid) {
      return;
    }
    try {
      this.nativeListener = await this.nativeAlarm.addListener('stateChanged', () => {
        void this.loadSettings();
      });
      if (this.destroyed) {
        await this.nativeListener.remove();
      }
    } catch {
      this.error = 'Live settings updates are unavailable. Reopen this page to refresh.';
      this.changeDetector.markForCheck();
    }
  }

  ionViewWillEnter(): void {
    if (this.nativeAndroid) {
      void this.loadSettings();
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const snapshot = await this.nativeAlarm.getState();
      if (!this.destroyed) {
        this.settings.applyNativeSettings(snapshot);
        this.ready = true;
        this.error = '';
      }
    } catch {
      this.ready = false;
      this.error = 'Could not read Android monitoring settings. Return to the monitor and try again.';
    }
    if (!this.destroyed) {
      this.changeDetector.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.nativeListener) {
      void this.nativeListener.remove();
    }
  }
}
