import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonToggle,
  IonToolbar,
  NavController,
} from '@ionic/angular';

import { AuthService } from '../auth/auth.service';
import { NATIVE_ALARM } from '../home/native-alarm';
import { ThemeService } from '../theme/theme.service';

import { AlarmSettingsService } from './alarm-settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [FormsModule, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonToggle, IonToolbar],
})
export class SettingsPage implements OnInit, OnDestroy {
  theme = inject(ThemeService);
  settings = inject(AlarmSettingsService);
  auth = inject(AuthService);
  signOutState: 'idle' | 'confirming' | 'signing-out' = 'idle';
  private alertController = inject(AlertController);
  private nav = inject(NavController);
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

  async signOut(): Promise<void> {
    if (this.signOutState !== 'idle') return;
    this.signOutState = 'confirming';
    try {
      const dialog = await this.alertController.create({
        header: 'Sign out of this device?',
        cssClass: 'sign-out-confirmation',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Sign out', role: 'confirm' },
        ],
      });
      await dialog.present();
      const { role } = await dialog.onDidDismiss();
      if (role !== 'confirm') return;

      this.signOutState = 'signing-out';
      this.error = '';
      this.changeDetector.markForCheck();
      await this.auth.logout();
      await this.nav.navigateRoot('/login');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not sign out. Try again.';
    } finally {
      this.signOutState = 'idle';
      this.changeDetector.markForCheck();
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
