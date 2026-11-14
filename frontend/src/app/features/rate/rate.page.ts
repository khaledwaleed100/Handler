import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { Attribute, OUTFIELD_ATTRIBUTES, RatingTask } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { errorMessage } from '../../core/http';
import { AvatarComponent } from '../../shared/ui/avatar.component';
import { IconComponent } from '../../shared/ui/icon.component';

interface Answer {
  scores: Partial<Record<Attribute, number>>;
  playAgain: boolean | null;
}

/**
 * Post-match rating: one card per assigned teammate (5 quick 1-5 taps, plus
 * "happy to play with them again?"), then the MVP pick. Under a minute.
 */
@Component({
  selector: 'app-rate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, RouterLink, TPipe, AvatarComponent, IconComponent],
  template: `
    <div class="page !pb-8">
      <header class="mb-4 flex items-center gap-2">
        <a [routerLink]="['/matches', id()]" class="icon-btn" [attr.aria-label]="'app.close' | t"><app-icon name="x" /></a>
        <h1 class="flex-1 text-lg font-black">{{ 'rate.title' | t }}</h1>
        @if (task() && state() === 'rating') {
          <span class="chip num">{{ 'rate.step' | t: { i: step() + 1, n: totalSteps() } }}</span>
        }
      </header>

      @if (state() === 'loading') { <div class="skeleton h-96"></div> }

      @if (state() === 'error') {
        <p class="card card-pad text-center">{{ error() }}</p>
        <a routerLink="/home" class="btn btn-ghost btn-block mt-4">{{ 'nav.home' | t }}</a>
      }

      @if (state() === 'finished') {
        <div class="card card-pad mt-10 text-center pop">
          <div class="text-5xl">🙌</div>
          <p class="mt-3 font-bold">{{ 'rate.done' | t }}</p>
          <a routerLink="/home" class="btn btn-primary btn-block mt-5">{{ 'nav.home' | t }}</a>
        </div>
      }

      @if (state() === 'rating' && task(); as t) {
        <div class="progress mb-4"><div [style.width.%]="((step() + 1) / totalSteps()) * 100"></div></div>

        @if (step() === 0) {
          <p class="mb-4 flex items-start gap-2 text-sm muted">
            <app-icon name="lock" [size]="16" class="mt-0.5" /> {{ 'rate.intro' | t: { n: t.ratees.length, place: t.place } }}
          </p>
        }

        @if (step() < t.ratees.length) {
          @let id = t.ratees[step()];
          @let p = t.players[id];
          @let ans = answers()[id];
          <div class="card card-pad rise" [attr.data-key]="id">
            <div class="mb-4 flex items-center gap-3">
              <app-avatar [url]="p?.avatarUrl" [name]="p?.name || ''" [size]="3.5" />
              <div>
                <div class="text-lg font-black">{{ p?.name }}</div>
                <div class="text-sm muted">{{ ('pos.' + (p?.position || 'MID')) | t }}</div>
              </div>
            </div>

            @for (a of attrs; track a) {
              <div class="mb-3">
                <div class="mb-1.5 flex justify-between text-sm font-bold">
                  <span>{{ ('attr.' + a) | t }}</span>
                  <span class="muted">{{ ans.scores[a] ? (('rate.scale.' + ans.scores[a]) | t) : '' }}</span>
                </div>
                <div class="taps" dir="ltr">
                  @for (n of [1, 2, 3, 4, 5]; track n) {
                    <button [class.on]="ans.scores[a] === n" (click)="score(id, a, n)" [attr.aria-label]="('attr.' + a | t) + ' ' + n">{{ n }}</button>
                  }
                </div>
              </div>
            }

            @if (p?.position === 'GK') {
              <div class="mb-3">
                <div class="mb-1.5 text-sm font-bold">{{ 'attr.goalkeeping' | t }} <span class="muted">({{ 'app.optional' | t }})</span></div>
                <div class="taps" dir="ltr">
                  @for (n of [1, 2, 3, 4, 5]; track n) {
                    <button [class.on]="ans.scores.goalkeeping === n" (click)="score(id, 'goalkeeping', n)">{{ n }}</button>
                  }
                </div>
              </div>
            }

            <div class="divider mt-4 pt-4">
              <div class="mb-2 text-sm font-bold">{{ 'rate.playAgain' | t }}</div>
              <div class="grid grid-cols-2 gap-2">
                <button class="btn" [ngClass]="ans.playAgain === true ? 'btn-primary' : 'btn-ghost'" (click)="setPlayAgain(id, true)">👍</button>
                <button class="btn" [ngClass]="ans.playAgain === false ? 'btn-danger' : 'btn-ghost'" (click)="setPlayAgain(id, false)">👎</button>
              </div>
            </div>
          </div>
        } @else {
          <!-- MVP pick -->
          <div class="rise">
            <h2 class="mb-3 text-lg font-black">👑 {{ 'rate.mvpTitle' | t }}</h2>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
              @for (pid of mvpChoices(); track pid) {
                @let c = t.players[pid];
                <button class="card flex flex-col items-center gap-1.5 p-3 transition" (click)="mvp.set(mvp() === pid ? null : pid); ui.haptic()"
                        [ngClass]="mvp() === pid ? '!border-amber-400 ring-2 ring-amber-400' : ''">
                  <app-avatar [url]="c?.avatarUrl" [name]="c?.name || ''" [size]="3" />
                  <span class="w-full truncate text-center text-xs font-bold">{{ c?.name }}</span>
                </button>
              }
            </div>
          </div>
        }

        @if (error()) { <p class="error-text mt-3">{{ error() }}</p> }

        <div class="sticky bottom-0 mt-5 flex gap-2 py-3" style="background: var(--bg); padding-bottom: calc(env(safe-area-inset-bottom) + 0.75rem)">
          @if (step() > 0) {
            <button class="btn btn-ghost" (click)="step.set(step() - 1)">{{ 'app.back' | t }}</button>
          }
          @if (step() < t.ratees.length) {
            <button class="btn btn-primary flex-1" [disabled]="!stepComplete()" (click)="next()">{{ 'app.next' | t }}</button>
          } @else {
            <button class="btn btn-primary flex-1" [disabled]="busy()" (click)="submit()">
              {{ (busy() ? 'rate.sending' : 'rate.submit') | t }}
            </button>
          }
        </div>
        @if (step() === t.ratees.length && !mvp()) {
          <p class="text-center text-xs muted">{{ 'rate.mvpSkip' | t }}</p>
        }
      }
    </div>`
})
export class RatePage implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private i18n = inject(I18n);
  ui = inject(Ui);

  id = input.required<string>();
  readonly attrs = OUTFIELD_ATTRIBUTES;

  task = signal<RatingTask | null>(null);
  state = signal<'loading' | 'rating' | 'finished' | 'error'>('loading');
  step = signal(0);
  answers = signal<Record<string, Answer>>({});
  mvp = signal<string | null>(null);
  busy = signal(false);
  error = signal('');

  totalSteps = computed(() => (this.task()?.ratees.length ?? 0) + 1);
  mvpChoices = computed(() => Object.keys(this.task()?.players ?? {}));
  stepComplete = computed(() => {
    const t = this.task();
    if (!t) return false;
    const a = this.answers()[t.ratees[this.step()]];
    return !!a && this.attrs.every(k => a.scores[k]) && a.playAgain !== null;
  });

  async ngOnInit() {
    try {
      const t = await this.api.ratingTask(this.id());
      if (t.closed) { this.fail(this.i18n.t('rate.closed')); return; }
      if (t.done) { this.fail(this.i18n.t('rate.already')); return; }
      this.task.set(t);
      this.answers.set(Object.fromEntries(t.ratees.map(id => [id, { scores: {}, playAgain: null }])));
      this.state.set('rating');
    } catch (err) {
      this.fail(errorMessage(err, this.i18n.t('app.error')));
    }
  }

  score(id: string, attr: Attribute, n: number) {
    this.ui.haptic(6);
    this.answers.update(all => ({ ...all, [id]: { ...all[id], scores: { ...all[id].scores, [attr]: n } } }));
  }

  setPlayAgain(id: string, value: boolean) {
    this.ui.haptic(6);
    this.answers.update(all => ({ ...all, [id]: { ...all[id], playAgain: value } }));
  }

  next() {
    this.step.set(this.step() + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async submit() {
    const t = this.task();
    if (!t) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const ratings = t.ratees.map(ratee => ({
        ratee,
        scores: this.answers()[ratee].scores,
        playAgain: this.answers()[ratee].playAgain === true
      }));
      await this.api.submitRatings(this.id(), ratings, this.mvp());
      this.ui.haptic([10, 40, 10]);
      this.state.set('finished');
    } catch (err) {
      this.error.set(errorMessage(err, this.i18n.t('app.error')));
    } finally {
      this.busy.set(false);
    }
  }

  private fail(message: string) {
    this.error.set(message);
    this.state.set('error');
  }
}
