import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { errorMessage } from '../../core/http';
import { AuthShellComponent } from './auth-shell.component';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TPipe, AuthShellComponent],
  template: `
    <app-auth-shell [title]="'auth.welcome' | t">
      <form (ngSubmit)="submit()" class="rise">
        <label class="field">
          <span>{{ 'auth.email' | t }}</span>
          <input class="input" type="email" name="email" [(ngModel)]="email" required autocomplete="email" inputmode="email" />
        </label>
        <label class="field">
          <span>{{ 'auth.password' | t }}</span>
          <input class="input" type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
        </label>
        @if (error()) { <p class="error-text mb-3">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" [disabled]="busy() || !email() || !password()">
          {{ (busy() ? 'auth.signingIn' : 'auth.signIn') | t }}
        </button>
        <a routerLink="/forgot" class="mt-4 block text-center text-sm font-semibold" style="color: var(--primary-strong)">{{ 'auth.forgot' | t }}</a>
        <p class="mt-6 text-center text-sm muted">{{ 'auth.noAccount' | t }}</p>
      </form>
    </app-auth-shell>`
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private i18n = inject(I18n);
  returnUrl = input<string>();

  email = signal('');
  password = signal('');
  busy = signal(false);
  error = signal('');

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email().trim(), this.password());
      const target = this.returnUrl();
      await this.router.navigateByUrl(target && target.startsWith('/') && !target.startsWith('//') ? target : '/home');
    } catch (err) {
      this.error.set(errorMessage(err, this.i18n.t('app.error')));
    } finally {
      this.busy.set(false);
    }
  }
}
