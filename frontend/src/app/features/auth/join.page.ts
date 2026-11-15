import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { errorMessage } from '../../core/http';
import { Attributes, POSITIONS, Position } from '../../core/models';
import { AuthShellComponent } from './auth-shell.component';
import { SelfRatingComponent } from '../../shared/ui/self-rating.component';
import { GoogleButtonComponent } from '../../shared/ui/google-button.component';

/**
 * Sign-up through the invite link, in 3 short steps:
 *   1. account (name, email, phone, password)
 *   2. position
 *   3. honest self-rating + consent to share contact details with the organizer
 */
@Component({
  selector: 'app-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NgClass, TPipe, AuthShellComponent, SelfRatingComponent, GoogleButtonComponent],
  template: `
    <app-auth-shell [title]="group() ? ('auth.join' | t: { group: group() }) : ('auth.joinTitle' | t)">
      @switch (inviteState()) {
        @case ('checking') { <p class="text-center muted">{{ 'auth.checkingInvite' | t }}</p> }
        @case ('invalid') {
          <p class="card card-pad text-center">{{ 'auth.invalidInvite' | t }}</p>
          <a routerLink="/login" class="btn btn-ghost btn-block mt-4">{{ 'auth.haveAccount' | t }}</a>
        }
        @default {
          <!-- Step indicator -->
          <div class="mb-6 flex gap-2">
            @for (s of [1, 2, 3]; track s) {
              <div class="flex-1">
                <div class="h-1.5 rounded-full" [style.background]="step() >= s ? 'var(--primary)' : 'var(--bg-sunk)'"></div>
                <div class="mt-1 text-[11px] font-bold" [class.muted]="step() < s">{{ ('auth.step' + s) | t }}</div>
              </div>
            }
          </div>

          <form (ngSubmit)="next()" class="rise">
            @if (step() === 1) {
              @if (googleEmail()) {
                <p class="card card-pad mb-4 flex items-center gap-2 text-sm"><span class="text-lg">✅</span> {{ 'auth.googleAs' | t: { email: googleEmail() } }}</p>
              } @else {
                <app-google-button (credential)="onGoogle($event)" />
              }
              <label class="field"><span>{{ 'auth.name' | t }}</span>
                <input class="input" name="name" [(ngModel)]="name" required minlength="2" maxlength="40" autocomplete="name" /></label>
              @if (!googleEmail()) {
                <label class="field"><span>{{ 'auth.email' | t }}</span>
                  <input class="input" type="email" name="email" [(ngModel)]="email" required autocomplete="email" inputmode="email" /></label>
              }
              <label class="field"><span>{{ 'auth.phone' | t }}</span>
                <input class="input" type="tel" name="phone" [(ngModel)]="phone" required autocomplete="tel" inputmode="tel" dir="ltr" placeholder="+20 1xx xxx xxxx" /></label>
              @if (!googleEmail() && inviteState() === 'organizer') {
                <label class="field"><span>{{ 'auth.setupCode' | t }}</span>
                  <input class="input" name="setupCode" [(ngModel)]="setupCode" required autocomplete="off" dir="ltr" />
                  <p class="hint">{{ 'auth.setupCodeHint' | t }}</p></label>
              }
              @if (!googleEmail()) {
                <label class="field"><span>{{ 'auth.newPassword' | t }}</span>
                  <input class="input" type="password" name="password" [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
                  <p class="hint">{{ 'auth.passwordHint' | t }}</p></label>
              }
            }

            @if (step() === 2) {
              <p class="mb-3 font-bold">{{ 'auth.position' | t }}</p>
              <div class="grid grid-cols-2 gap-3">
                @for (p of positions; track p) {
                  <button type="button" class="card flex flex-col items-center gap-2 py-5 transition"
                          [ngClass]="position() === p ? '!border-[var(--primary)] ring-2 ring-[var(--primary)]' : ''"
                          (click)="position.set(p)">
                    <span class="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-black text-white" [ngClass]="'pos-' + p">{{ ('pos.short_' + p) | t }}</span>
                    <span class="font-bold">{{ ('pos.' + p) | t }}</span>
                  </button>
                }
              </div>
            }

            @if (step() === 3) {
              <h2 class="font-black">{{ 'auth.selfTitle' | t }}</h2>
              <p class="mb-4 mt-1 text-sm muted">{{ 'auth.selfHint' | t }}</p>
              <app-self-rating [(value)]="selfRating" [position]="position() || 'MID'" />
              <label class="card card-pad mt-2 flex items-start gap-3">
                <input type="checkbox" name="consent" [(ngModel)]="consent" class="mt-1 h-5 w-5 accent-emerald-500" />
                <span class="text-sm">{{ 'auth.consent' | t }}</span>
              </label>
            }

            @if (error()) { <p class="error-text mt-4">{{ error() }}</p> }

            <div class="mt-6 flex gap-2">
              @if (step() > 1) {
                <button type="button" class="btn btn-ghost" (click)="step.set(step() - 1)">{{ 'app.back' | t }}</button>
              }
              <button class="btn btn-primary flex-1" [disabled]="busy() || !canContinue()">
                {{ (step() < 3 ? 'app.next' : busy() ? 'auth.creating' : 'auth.create') | t }}
              </button>
            </div>
          </form>
          <a routerLink="/login" class="mt-6 block text-center text-sm font-semibold muted">{{ 'auth.haveAccount' | t }}</a>
        }
      }
    </app-auth-shell>`
})
export class JoinPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private i18n = inject(I18n);
  code = input.required<string>();

  readonly positions = POSITIONS;
  inviteState = signal<'checking' | 'valid' | 'invalid' | 'organizer'>('checking');
  group = signal('');
  step = signal(1);
  busy = signal(false);
  error = signal('');

  name = signal('');
  email = signal('');
  phone = signal('');
  password = signal('');
  position = signal<Position | null>(null);
  selfRating = signal<Attributes>({ pace: 60, attack: 60, passing: 60, defence: 60, physical: 60, goalkeeping: 50 });
  consent = signal(false);
  /** Set when the person chose "Continue with Google": no email/password fields then. */
  googleEmail = signal('');
  setupCode = signal('');

  async ngOnInit() {
    const pending = this.auth.googleSignup();
    if (pending?.email) this.useGoogle(pending.name || '', pending.email);
    // "/join/organizer" is how the organizer creates the first account (no invite needed).
    if (this.code() === 'organizer') { this.inviteState.set('organizer'); return; }
    try {
      const res = await this.auth.checkInvite(this.code());
      this.group.set(res.groupName);
      this.inviteState.set('valid');
    } catch {
      this.inviteState.set('invalid');
    }
  }

  private useGoogle(name: string, email: string) {
    this.googleEmail.set(email);
    if (!this.name()) this.name.set(name);
  }

  async onGoogle(credential: string) {
    this.error.set('');
    this.busy.set(true);
    try {
      const pending = await this.auth.google(credential, this.inviteState() === 'organizer' ? undefined : this.code());
      if (!pending) { await this.router.navigate(['/home']); return; } // already had an account
      this.useGoogle(pending.name || '', pending.email || '');
    } catch (err) {
      this.error.set(errorMessage(err, this.i18n.t('app.error')));
    } finally {
      this.busy.set(false);
    }
  }

  canContinue() {
    if (this.step() === 1 && this.googleEmail()) return this.name().trim().length >= 2 && this.phone().trim().length >= 7;
    if (this.step() === 1) return this.name().trim().length >= 2 && /\S+@\S+\.\S+/.test(this.email()) && this.phone().trim().length >= 7 && this.password().length >= 8
      && (this.inviteState() !== 'organizer' || this.setupCode().trim().length >= 8);
    if (this.step() === 2) return !!this.position();
    return this.consent();
  }

  async next() {
    this.error.set('');
    if (this.step() < 3) { this.step.set(this.step() + 1); return; }
    this.busy.set(true);
    try {
      if (this.googleEmail()) {
        await this.auth.googleComplete({
          name: this.name().trim(), phone: this.phone().trim(), position: this.position(),
          selfRating: this.selfRating(), consent: this.consent(), lang: this.i18n.lang()
        });
        await this.router.navigate(['/home']);
        return;
      }
      await this.auth.register({
        name: this.name().trim(),
        email: this.email().trim(),
        phone: this.phone().trim(),
        password: this.password(),
        position: this.position(),
        selfRating: this.selfRating(),
        consent: this.consent(),
        inviteCode: this.inviteState() === 'organizer' ? undefined : this.code(),
        setupCode: this.inviteState() === 'organizer' ? this.setupCode().trim() : undefined,
        lang: this.i18n.lang()
      });
      await this.router.navigate(['/home']);
    } catch (err) {
      this.error.set(errorMessage(err, this.i18n.t('app.error')));
      // Account details are usually the problem (email taken, weak password).
      if (/email|password|phone|name/i.test(this.error())) this.step.set(1);
    } finally {
      this.busy.set(false);
    }
  }
}
