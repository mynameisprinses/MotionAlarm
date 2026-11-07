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
  mode: 'login' | 'register' = 'login';
  email = '';
  password = '';
  confirmation = '';
  showPassword = false;
  busy = false;
  error = '';
  feedback = '';
  private nav = inject(NavController);
  private changeDetector = inject(ChangeDetectorRef);

  async ionViewWillEnter(): Promise<void> {
    this.showPassword = false;
    await this.auth.ready;
    if (this.auth.user()) {
      await this.nav.navigateRoot('/home');
    }
  }

  changeMode(mode: 'login' | 'register'): void {
    this.mode = mode;
    this.password = '';
    this.confirmation = '';
    this.showPassword = false;
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
      if (this.mode === 'register') {
        const loggedIn = await this.auth.register(this.email, this.password);
        if (!loggedIn) {
          this.changeMode('login');
          this.feedback = 'Check your email for a confirmation link, then return here to log in.';
          return;
        }
      } else {
        await this.auth.login(this.email, this.password);
      }
      this.password = '';
      this.confirmation = '';
      this.showPassword = false;
      this.changeDetector.markForCheck();
      await this.nav.navigateRoot('/home');
    } catch (error) {
      this.error = authErrorMessage(error);
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }
}
