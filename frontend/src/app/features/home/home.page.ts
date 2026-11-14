import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { Home, MatchWithPlayers } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { PollService } from '../../core/services/poll.service';
import { RsvpCardComponent } from '../../shared/ui/rsvp-card.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { AvatarComponent } from '../../shared/ui/avatar.component';

/** Home answers one question: "what do I need to do?" */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, RsvpCardComponent, IconComponent, AvatarComponent],
  template: `
    <div class="page">
      <header class="mb-5 flex items-center gap-3">
        <a routerLink="/me" class="shrink-0" [attr.aria-label]="'nav.me' | t">
          <app-avatar [url]="auth.player()?.avatarUrl" [name]="auth.user()?.name || ''" [size]="2.75" />
        </a>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold uppercase tracking-wider muted">{{ home()?.groupName }}</div>
          <h1 class="truncate text-xl font-black">{{ 'home.hello' | t: { name: firstName() } }} 👋</h1>
        </div>
        @if (auth.isOrganizer()) {
          <a routerLink="/me" class="icon-btn" [attr.aria-label]="'nav.me' | t"><app-icon name="user" /></a>
        }
      </header>

      @if (loading() && !home()) {
        <div class="skeleton h-72"></div>
        <div class="skeleton mt-4 h-20"></div>
      } @else if (home(); as h) {
        <h2 class="section-title !mt-0">{{ 'home.nextMatch' | t }}</h2>
        @if (h.next) {
          <app-rsvp-card [match]="h.next" [currency]="h.currency" (changed)="onRsvp($event)" />
        } @else {
          <div class="card card-pad text-center">
            <div class="text-4xl">🏟️</div>
            <p class="mt-2 font-bold">{{ 'home.noMatch' | t }}</p>
            <p class="text-sm muted">{{ 'home.noMatchHint' | t }}</p>
            @if (auth.isOrganizer()) {
              <a routerLink="/matches" [queryParams]="{ new: 1 }" class="btn btn-primary mt-4">{{ 'home.createMatch' | t }}</a>
            }
          </div>
        }

        <h2 class="section-title">{{ 'home.todo' | t }}</h2>
        <div class="flex flex-col gap-2">
          @for (r of h.todo.rate; track r.matchId) {
            <a class="card card-pad flex items-center gap-3 rise" [routerLink]="['/matches', r.matchId, 'rate']">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style="background: var(--primary-soft)">⭐</span>
              <span class="min-w-0 flex-1">
                <span class="block font-bold">{{ 'home.rateTitle' | t: { n: r.count, place: r.place } }}</span>
                <span class="text-xs muted">{{ 'home.rateHint' | t }}</span>
              </span>
              <app-icon name="chevron" class="muted" />
            </a>
          }
          @if (polls.pendingVotes() > 0) {
            <a class="card card-pad flex items-center gap-3 rise" routerLink="/vote">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style="background: rgba(245,158,11,.15)">🏆</span>
              <span class="flex-1 font-bold">{{ 'home.pollOpen' | t }}</span>
              <app-icon name="chevron" class="muted" />
            </a>
          }
          @for (u of h.todo.unpaid; track u.matchId) {
            <a class="card card-pad flex items-center gap-3 rise" [routerLink]="['/matches', u.matchId]">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style="background: rgba(220,38,38,.12)">💸</span>
              <span class="flex-1 font-bold">{{ 'home.pay' | t: { amount: i18n.money(u.price, h.currency), place: u.place } }}</span>
            </a>
          }
          @for (n of h.todo.needResult || []; track n.matchId) {
            <a class="card card-pad flex items-center gap-3 rise" [routerLink]="['/matches', n.matchId]" [queryParams]="{ tab: 'result' }">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style="background: var(--primary-soft)">📝</span>
              <span class="flex-1 font-bold">{{ 'home.needResult' | t: { place: n.place } }}</span>
              <app-icon name="chevron" class="muted" />
            </a>
          }
          @if (h.todo.disputes) {
            <a class="card card-pad flex items-center gap-3 rise" routerLink="/organizer">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style="background: rgba(245,158,11,.15)">⏱</span>
              <span class="flex-1 font-bold">{{ 'home.disputes' | t: { n: h.todo.disputes } }}</span>
              <app-icon name="chevron" class="muted" />
            </a>
          }
          @if (nothingToDo()) {
            <p class="card card-pad text-center text-sm muted">✅ {{ 'home.allDone' | t }}</p>
          }
        </div>
      } @else {
        <div class="card card-pad text-center">
          <p class="font-bold">{{ 'app.error' | t }}</p>
          <button class="btn btn-ghost mt-3" (click)="load()">{{ 'app.retry' | t }}</button>
        </div>
      }
    </div>`
})
export class HomePage implements OnInit {
  private api = inject(Api);
  private ui = inject(Ui);
  auth = inject(AuthService);
  i18n = inject(I18n);
  polls = inject(PollService);

  home = signal<Home | null>(null);
  loading = signal(true);

  firstName = computed(() => (this.auth.user()?.name || '').split(' ')[0]);
  nothingToDo = computed(() => {
    const t = this.home()?.todo;
    return !!t && !t.rate.length && !t.unpaid.length && !t.disputes && !(t.needResult?.length) && this.polls.pendingVotes() === 0;
  });

  ngOnInit() {
    this.load();
    this.polls.refresh().catch(() => {});
  }

  async load() {
    this.loading.set(true);
    try {
      this.home.set(await this.api.home());
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  onRsvp(match: MatchWithPlayers) {
    this.home.update(h => (h ? { ...h, next: match } : h));
  }
}
