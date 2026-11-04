import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, NavController } from '@ionic/angular';

import { AuthService, authErrorMessage } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, IonButton, IonContent],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  auth = inject(AuthService);
  mode: 'login' | 'register' | 'reset' = 'login';
  email = '';
  password = '';
  confirmation = '';
  busy = false;
  error = '';
  feedback = '';
  private nav = inject(NavController);
  private changeDetector = inject(ChangeDetectorRef);

  async ionViewWillEnter(): Promise<void> {
    await this.auth.ready;
    if (this.auth.user()) {
      await this.nav.navigateRoot('/home');
    }
  }

  changeMode(mode: 'login' | 'register' | 'reset'): void {
    this.mode = mode;
    this.password = '';
    this.confirmation = '';
    this.error = '';
    this.feedback = '';
  }

  async submit(): Promise<void> {
    if (this.busy) return;
    this.error = '';
    this.feedback = '';
    if (this.mode === 'register' && this.password !== this.confirmation) {
      this.error = 'Passwords do not match.';
      return;
    }
    this.busy = true;
    try {
      if (this.mode === 'reset') {
        await this.auth.resetPassword(this.email);
        this.feedback = 'If an account exists for this email, a password reset link will be sent. Check your inbox.';
      } else {
        if (this.mode === 'register') {
          await this.auth.register(this.email, this.password);
        } else {
          await this.auth.login(this.email, this.password);
        }
        this.password = '';
        this.confirmation = '';
        this.changeDetector.markForCheck();
        await this.nav.navigateRoot('/home');
      }
    } catch (error) {
      this.error = authErrorMessage(error);
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }
}
