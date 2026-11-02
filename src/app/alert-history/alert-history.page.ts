import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, inject } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline } from 'ionicons/icons';

import type { MovementAlert } from '../home/movement-alert';
import { NATIVE_ALARM } from '../home/native-alarm';

import { AlertHistoryService } from './alert-history.service';

@Component({
  selector: 'app-alert-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: 'alert-history.page.html',
  styleUrls: ['alert-history.page.scss'],
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
  ],
})
export class AlertHistoryPage implements OnInit, OnDestroy {
  history = inject(AlertHistoryService);
  historyFilter = 'All';
  historyDate = this.localDate(new Date());
  feedback = '';

  private changeDetector = inject(ChangeDetectorRef);
  private alertController = inject(AlertController);
  private nativeAlarm = inject(NATIVE_ALARM);
  private nativeListener: PluginListenerHandle | null = null;
  private destroyed = false;

  constructor() {
    addIcons({ checkmarkCircleOutline });
  }

  async ngOnInit(): Promise<void> {
    if (!this.history.nativeAndroid) {
      return;
    }
    try {
      this.nativeListener = await this.nativeAlarm.addListener('stateChanged', () => {
        void this.loadHistory();
      });
      if (this.destroyed) {
        await this.nativeListener.remove();
      }
    } catch {
      this.history.storageError = 'Live history updates are unavailable. Reopen this page to refresh the logs.';
      this.changeDetector.markForCheck();
    }
  }

  // Ionic keeps pages in memory. Refresh Android logs each time this page opens.
  ionViewWillEnter(): void {
    this.showToday();
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    await this.history.refresh();
    if (!this.destroyed) {
      this.changeDetector.markForCheck();
    }
  }

  get visibleAlerts(): MovementAlert[] {
    const result: MovementAlert[] = [];
    for (const alert of this.history.alerts) {
      if (this.historyDate && this.localDate(new Date(alert.createdAt)) !== this.historyDate) {
        continue;
      }
      if (this.historyFilter === 'All' || alert.status === this.historyFilter) {
        result.push(alert);
      }
    }
    return result;
  }

  get newAlertCount(): number {
    let count = 0;
    for (const alert of this.history.alerts) {
      if (this.historyDate && this.localDate(new Date(alert.createdAt)) !== this.historyDate) {
        continue;
      }
      if (alert.status === 'New') {
        count++;
      }
    }
    return count;
  }

  showToday(): void {
    this.historyDate = this.localDate(new Date());
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  async toggleStatus(alert: MovementAlert): Promise<void> {
    let status = 'New';
    if (alert.status === 'New') {
      status = 'Reviewed';
    }
    try {
      await this.history.toggleStatus(alert);
      this.feedback = 'Alert marked ' + status.toLowerCase() + '.';
    } catch (error) {
      this.showError(error, 'Could not update the alert. Try again.');
    }
    this.changeDetector.markForCheck();
  }

  async confirmDelete(alert: MovementAlert): Promise<void> {
    const dialog = await this.alertController.create({
      header: 'Delete this alert?',
      message: 'This removes the alert from this device.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            void this.deleteAlert(alert.id);
          },
        },
      ],
    });
    await dialog.present();
  }

  private async deleteAlert(id: string): Promise<void> {
    try {
      await this.history.deleteAlert(id);
      this.feedback = 'Alert deleted.';
    } catch (error) {
      this.showError(error, 'Could not delete the alert. Try again.');
    }
    this.changeDetector.markForCheck();
  }

  async confirmClearHistory(): Promise<void> {
    const dialog = await this.alertController.create({
      header: 'Clear all alert history?',
      message: 'All saved alerts on this device will be deleted. This cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear history',
          role: 'destructive',
          handler: () => {
            void this.clearHistory();
          },
        },
      ],
    });
    await dialog.present();
  }

  private async clearHistory(): Promise<void> {
    try {
      await this.history.clearHistory();
      this.historyFilter = 'All';
      this.feedback = 'Alert history cleared.';
    } catch (error) {
      this.showError(error, 'History could not be cleared. Check device storage and try again.');
    }
    this.changeDetector.markForCheck();
  }

  private showError(error: unknown, fallback: string): void {
    this.feedback = '';
    this.history.storageError = fallback;
    if (error instanceof Error) {
      this.history.storageError = error.message;
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (!document.hidden && this.history.nativeAndroid) {
      void this.loadHistory();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.nativeListener) {
      void this.nativeListener.remove();
    }
  }
}
