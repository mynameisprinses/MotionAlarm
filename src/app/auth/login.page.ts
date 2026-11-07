import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, NavController } from '@ionic/angular';

import { AuthService, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, authErrorMessage } from './auth.service';

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
  readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  readonly maxPasswordLength = MAX_PASSWORD_LENGTH;
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
  }

  async submit(): Promise<void> {
    if (this.busy) return;
    this.error = '';
    if (this.mode === 'register' && this.password !== this.confirmation) {
      this.error = 'Passwords do not match.';
      return;
    }
    this.busy = true;
    try {
      if (this.mode === 'register') {
        await this.auth.register(this.email, this.password);
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
