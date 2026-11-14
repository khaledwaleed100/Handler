import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { Match, MatchList } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { toIso, todayInput } from '../../core/util';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-matches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TPipe, IconComponent],
  template: `
    <div class="page">
      <header class="mb-4 flex items-center justify-between">
        <h1 class="page-title">{{ 'nav.matches' | t }}</h1>
        @if (auth.isOrganizer()) {
          <button class="btn btn-sm btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="18" /> {{ 'match.newMatch' | t }}</button>
        }
      </header>

      <div class="seg mb-4">
        <button [class.on]="scope() === 'upcoming'" (click)="setScope('upcoming')">{{ 'match.upcoming' | t }}</button>
        <button [class.on]="scope() === 'past'" (click)="setScope('past')">{{ 'match.past' | t }}</button>
      </div>

      @if (loading() && !list()) {
        @for (i of [1, 2, 3]; track i) { <div class="skeleton mb-3 h-24"></div> }
      } @else if (list(); as l) {
        @if (!l.matches.length) {
          <div class="card card-pad text-center muted">{{ 'match.none' | t }}</div>
        }
        <div class="flex flex-col gap-3">
          @for (m of l.matches; track m._id) {
            <a class="card card-pad flex items-center gap-4 rise" [routerLink]="['/matches', m._id]">
              <div class="flex w-14 shrink-0 flex-col items-center rounded-xl py-2" style="background: var(--bg-sunk)">
                <span class="text-[11px] font-bold uppercase muted">{{ i18n.date(m.kickoff, { month: 'short' }) }}</span>
                <span class="text-2xl font-black leading-none num">{{ i18n.date(m.kickoff, { day: 'numeric' }) }}</span>
                <span class="text-[11px] font-bold muted">{{ i18n.date(m.kickoff, { weekday: 'short' }) }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate font-bold">{{ m.place }}</div>
                <div class="text-sm muted num">{{ i18n.date(m.kickoff, { hour: '2-digit', minute: '2-digit' }) }}</div>
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                  @switch (m.status) {
                    @case ('upcoming') {
                      <span class="chip">{{ 'home.spots' | t: { n: m.rsvp.confirmed.length, cap: m.capacity } }}</span>
                      @if (m.myPlace === 'confirmed') { <span class="chip chip-primary">{{ 'home.youreIn' | t }}</span> }
                      @if (m.myPlace === 'waitlist') { <span class="chip chip-warn">{{ 'match.waitlist' | t }}</span> }
                      @if (m.teamsPublished) { <span class="chip">👕</span> }
                    }
                    @case ('cancelled') { <span class="chip chip-danger">{{ 'match.cancelled' | t }}</span> }
                    @case ('completed') {
                      @if (m.ratings?.myTaskPending) { <span class="chip chip-warn">⭐ {{ 'match.rateNow' | t }}</span> }
                    }
                  }
                </div>
              </div>
              @if (m.status === 'completed' && m.score) {
                <div class="text-2xl font-black num" dir="ltr">
                  <span style="color: var(--team-a)">{{ m.score.a }}</span><span class="muted">–</span><span style="color: var(--team-b)">{{ m.score.b }}</span>
                </div>
              } @else {
                <app-icon name="chevron" class="muted" />
              }
            </a>
          }
        </div>
      }
    </div>

    @if (creating()) {
      <div class="sheet-backdrop" (click)="creating.set(false)">
        <form class="sheet" (click)="$event.stopPropagation()" (ngSubmit)="create()">
          <div class="sheet-handle"></div>
          <h2 class="mb-4 text-lg font-black">{{ 'match.newMatch' | t }}</h2>
          <label class="field"><span>{{ 'match.place' | t }}</span>
            <input class="input" name="place" [(ngModel)]="form.place" required maxlength="80" list="recent-places" />
            <datalist id="recent-places">@for (p of recentPlaces(); track p) { <option [value]="p"></option> }</datalist>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="field"><span>{{ 'match.date' | t }}</span>
              <input class="input" type="date" name="date" [(ngModel)]="form.date" [min]="today" required /></label>
            <label class="field"><span>{{ 'match.time' | t }}</span>
              <input class="input" type="time" name="time" [(ngModel)]="form.time" required /></label>
            <label class="field"><span>{{ 'match.capacity' | t }}</span>
              <input class="input num" type="number" name="capacity" [(ngModel)]="form.capacity" min="2" max="22" inputmode="numeric" /></label>
            <label class="field"><span>{{ 'match.price' | t }}</span>
              <input class="input num" type="number" name="price" [(ngModel)]="form.price" min="0" inputmode="numeric" /></label>
          </div>
          <label class="field"><span>{{ 'match.mapLink' | t }} <span class="muted">({{ 'app.optional' | t }})</span></span>
            <input class="input" type="url" name="mapUrl" [(ngModel)]="form.mapUrl" placeholder="https://maps.google.com/…" dir="ltr" /></label>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button type="button" class="btn btn-ghost" (click)="creating.set(false)">{{ 'app.cancel' | t }}</button>
            <button class="btn btn-primary" [disabled]="busy() || !form.place || !form.date || !form.time">{{ (busy() ? 'match.creating' : 'match.create') | t }}</button>
          </div>
        </form>
      </div>
    }`
})
export class MatchesPage implements OnInit {
  private api = inject(Api);
  private ui = inject(Ui);
  private router = inject(Router);
  auth = inject(AuthService);
  i18n = inject(I18n);

  /** ?new=1 opens the create sheet directly (from Home). */
  new = input<string>();

  scope = signal<'upcoming' | 'past'>('upcoming');
  list = signal<MatchList | null>(null);
  loading = signal(true);
  creating = signal(false);
  busy = signal(false);
  recentPlaces = signal<string[]>([]);
  readonly today = todayInput();
  form = { place: '', date: todayInput(), time: '20:00', capacity: 10, price: 0, mapUrl: '' };

  ngOnInit() {
    this.load();
    if (this.new() && this.auth.isOrganizer()) this.openCreate();
  }

  setScope(s: 'upcoming' | 'past') {
    if (s === this.scope()) return;
    this.scope.set(s);
    this.list.set(null);
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.list.set(await this.api.matches(this.scope()));
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  async openCreate() {
    this.creating.set(true);
    // Suggest the last place and settings, since groups usually play at the same pitch.
    try {
      const past = await this.api.matches('past');
      const places = [...new Set(past.matches.map((m: Match) => m.place))].slice(0, 5);
      this.recentPlaces.set(places);
      const last = past.matches[0];
      if (last && !this.form.place) {
        this.form = { ...this.form, place: last.place, mapUrl: last.mapUrl, capacity: last.capacity, price: last.price };
      }
    } catch { /* suggestions are optional */ }
  }

  async create() {
    this.busy.set(true);
    try {
      const m = await this.api.createMatch({
        place: this.form.place.trim(),
        mapUrl: this.form.mapUrl.trim() || undefined,
        kickoff: toIso(this.form.date, this.form.time),
        capacity: Number(this.form.capacity),
        price: Number(this.form.price) || 0
      });
      this.creating.set(false);
      this.ui.toast(this.i18n.t('match.created'));
      await this.router.navigate(['/matches', m._id]);
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
