import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { errorMessage } from '../../core/http';
import { AuthShellComponent } from './auth-shell.component';

/** Password reset with a 6-digit code sent by email. */
@Component({
  selector: 'app-forgot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TPipe, AuthShellComponent],
  template: `
    <app-auth-shell [title]="'auth.forgotTitle' | t" [subtitle]="step() === 'email' ? ('auth.forgotHint' | t) : ''">
      @switch (step()) {
        @case ('email') {
          <form (ngSubmit)="send()" class="rise">
            <label class="field"><span>{{ 'auth.email' | t }}</span>
              <input class="input" type="email" name="email" [(ngModel)]="email" required autocomplete="email" inputmode="email" /></label>
            @if (error()) { <p class="error-text mb-3">{{ error() }}</p> }
            <button class="btn btn-primary btn-block" [disabled]="busy() || !email()">{{ 'auth.sendCode' | t }}</button>
          </form>
        }
        @case ('code') {
          <form (ngSubmit)="reset()" class="rise">
            <p class="card card-pad mb-4 text-sm">{{ 'auth.codeSent' | t }}</p>
            <label class="field"><span>{{ 'auth.code' | t }}</span>
              <input class="input text-center text-2xl font-black tracking-[0.5em] num" name="code" [(ngModel)]="code"
                     inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required dir="ltr" /></label>
            <label class="field"><span>{{ 'auth.newPassword' | t }}</span>
              <input class="input" type="password" name="pw" [(ngModel)]="password" autocomplete="new-password" required />
              <p class="hint">{{ 'auth.passwordHint' | t }}</p></label>
            @if (error()) { <p class="error-text mb-3">{{ error() }}</p> }
            <button class="btn btn-primary btn-block" [disabled]="busy() || code().length !== 6 || password().length < 8">{{ 'auth.setPassword' | t }}</button>
          </form>
        }
        @case ('done') {
          <p class="card card-pad text-center rise">{{ 'auth.resetDone' | t }}</p>
        }
      }
      <a routerLink="/login" class="mt-6 block text-center text-sm font-semibold muted">{{ 'auth.backToLogin' | t }}</a>
    </app-auth-shell>`
})
export class ForgotPage {
  private auth = inject(AuthService);
  private i18n = inject(I18n);
  step = signal<'email' | 'code' | 'done'>('email');
  email = signal('');
  code = signal('');
  password = signal('');
  busy = signal(false);
  error = signal('');

  async send() {
    await this.run(async () => {
      await this.auth.forgot(this.email().trim());
      this.step.set('code');
    });
  }

  async reset() {
    await this.run(async () => {
      await this.auth.reset(this.email().trim(), this.code().trim(), this.password());
      this.step.set('done');
    });
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set('');
    try { await fn(); } catch (err) { this.error.set(errorMessage(err, this.i18n.t('app.error'))); } finally { this.busy.set(false); }
  }
}
