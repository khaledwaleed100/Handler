import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { MatchWithPlayers, RsvpStatus } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { Forecast, WeatherService } from '../../core/services/weather.service';
import { downloadCalendarEvent, mapLink } from '../../core/util';
import { IconComponent } from './icon.component';

/** The "next match" card: when, where, weather, how many are in, and big In / Out / Maybe buttons. */
@Component({
  selector: 'app-rsvp-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, RouterLink, TPipe, IconComponent],
  template: `
    @let m = match();
    <div class="card overflow-hidden">
      <div class="p-4 text-white" style="background: linear-gradient(135deg, #15803d, #065f46)">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-bold opacity-90">{{ i18n.date(m.kickoff, { weekday: 'long', day: 'numeric', month: 'short' }) }}</div>
            <div class="text-3xl font-black num">{{ i18n.date(m.kickoff, { hour: '2-digit', minute: '2-digit' }) }}</div>
            <a class="mt-1 flex items-center gap-1 truncate text-sm font-semibold underline-offset-2 hover:underline" [href]="map()" target="_blank" rel="noopener">
              <app-icon name="pin" [size]="16" /> {{ m.place }}
            </a>
          </div>
          <div class="text-end">
            <div class="rounded-full bg-black/20 px-2.5 py-1 text-xs font-bold">{{ countdown() }}</div>
            @if (weather(); as w) {
              <div class="mt-2 text-sm font-bold">{{ w.icon }} {{ w.temperature }}°</div>
              @if (w.rainChance >= 30) { <div class="text-xs opacity-90">💧 {{ w.rainChance }}%</div> }
            }
          </div>
        </div>
      </div>

      <div class="p-4">
        <div class="mb-1.5 flex items-center justify-between text-sm font-bold">
          <span>{{ 'home.spots' | t: { n: m.rsvp.confirmed.length, cap: m.capacity } }}</span>
          <span class="muted">
            @if (spotsLeft() > 0) { {{ 'home.spotsLeft' | t: { n: spotsLeft() } }} } @else { {{ 'home.full' | t }} }
          </span>
        </div>
        <div class="progress mb-4"><div [style.width.%]="(m.rsvp.confirmed.length / m.capacity) * 100"></div></div>

        @if (m.status === 'upcoming') {
          <div class="mb-3 text-center text-sm font-bold" [ngClass]="m.myPlace === 'confirmed' ? 'text-emerald-500' : 'muted'">
            @switch (true) {
              @case (m.myPlace === 'confirmed') { {{ 'home.youreIn' | t }} }
              @case (m.myPlace === 'waitlist') { {{ 'home.waitlist' | t: { n: waitPos() } }} }
              @case (m.myRsvp === 'out') { {{ 'home.youreOut' | t }} }
              @case (m.myRsvp === 'maybe') { {{ 'home.youreMaybe' | t }} }
            }
          </div>
          <div class="grid grid-cols-3 gap-2">
            @for (o of options; track o.status) {
              <button class="btn !px-2 text-sm" [disabled]="busy()"
                      [ngClass]="m.myRsvp === o.status ? o.on : 'btn-ghost'"
                      (click)="reply(o.status)">{{ o.label | t }}</button>
            }
          </div>
        }

        <div class="mt-3 flex flex-wrap gap-2">
          @if (m.teamsPublished && (m.teamA.length || m.teamB.length) && showLink()) {
            <a class="btn btn-sm btn-soft" [routerLink]="['/matches', m._id]">👕 {{ 'home.seeTeams' | t }}</a>
          } @else if (showLink()) {
            <a class="btn btn-sm btn-ghost" [routerLink]="['/matches', m._id]">{{ 'match.tabPlayers' | t }} <app-icon name="chevron" [size]="16" /></a>
          }
          <button class="btn btn-sm btn-ghost" (click)="calendar()"><app-icon name="calendar" [size]="16" /> {{ 'match.addToCalendar' | t }}</button>
          @if (m.price > 0) { <span class="chip ms-auto self-center">{{ 'match.yourPayment' | t: { amount: i18n.money(m.price, currency()) } }}</span> }
        </div>
      </div>
    </div>`
})
export class RsvpCardComponent implements OnInit {
  i18n = inject(I18n);
  private api = inject(Api);
  private auth = inject(AuthService);
  private ui = inject(Ui);
  private weatherService = inject(WeatherService);

  match = input.required<MatchWithPlayers>();
  currency = input('EGP');
  showLink = input(true);
  changed = output<MatchWithPlayers>();

  busy = signal(false);
  weather = signal<Forecast | null>(null);

  readonly options: { status: RsvpStatus; label: string; on: string }[] = [
    { status: 'in', label: 'home.in', on: 'btn-primary' },
    { status: 'maybe', label: 'home.maybe', on: 'btn-soft' },
    { status: 'out', label: 'home.out', on: 'btn-danger' }
  ];

  spotsLeft = computed(() => Math.max(0, this.match().capacity - this.match().rsvp.confirmed.length));
  waitPos = computed(() => {
    const me = this.auth.player()?._id;
    return (me ? this.match().rsvp.waitlist.indexOf(me) : -1) + 1 || 1;
  });
  countdown = computed(() => {
    const ms = new Date(this.match().kickoff).getTime() - Date.now();
    return ms > 0 ? this.i18n.t('home.kickoffIn', { t: this.i18n.duration(ms) }) : this.i18n.t('home.startedAgo', { t: this.i18n.duration(ms) });
  });
  map = computed(() => mapLink(this.match()));

  async ngOnInit() {
    this.weather.set(await this.weatherService.forecastAt(this.match().kickoff));
  }

  async reply(status: RsvpStatus) {
    if (this.match().myRsvp === status) return;
    this.busy.set(true);
    this.ui.haptic();
    try {
      this.changed.emit(await this.api.rsvp(this.match()._id, status));
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  calendar() {
    downloadCalendarEvent(this.match(), `⚽ 5-a-side · ${this.match().place}`);
  }
}
