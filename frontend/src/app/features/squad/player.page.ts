import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { PlayerProfile } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { PlayerCardComponent } from '../../shared/ui/player-card.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, RouterLink, TPipe, PlayerCardComponent, IconComponent],
  template: `
    <div class="page">
      <header class="mb-4 flex items-center gap-2">
        <a routerLink="/squad" class="icon-btn" [attr.aria-label]="'app.back' | t"><app-icon name="back" /></a>
      </header>
      @if (profile(); as pr) {
        <app-player-card [player]="pr.player" variant="full" class="rise block" />
        <h2 class="section-title">{{ 'squad.recent' | t }}</h2>
        <div class="card">
          @for (r of pr.recent; track r.matchId) {
            <a class="row-link" [routerLink]="['/matches', r.matchId]">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white"
                    [ngClass]="r.result === 'W' ? 'bg-emerald-500' : r.result === 'D' ? 'bg-slate-400' : 'bg-rose-500'">{{ r.result }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{{ r.place }}</span>
                <span class="text-xs muted">{{ i18n.date(r.kickoff, { day: 'numeric', month: 'short' }) }}</span>
              </span>
              <span class="text-sm font-bold num">
                @if (r.mvp) { 👑 }
                @if (r.goals) { ⚽{{ r.goals }} }
                @if (r.assists) { 👟{{ r.assists }} }
              </span>
              <span class="w-12 text-end font-black num" dir="ltr">{{ r.score }}</span>
            </a>
          } @empty {
            <p class="card-pad text-center text-sm muted">{{ 'squad.noRecent' | t }}</p>
          }
        </div>
      } @else {
        <div class="skeleton h-80"></div>
      }
    </div>`
})
export class PlayerPage implements OnInit {
  private api = inject(Api);
  private ui = inject(Ui);
  i18n = inject(I18n);
  id = input.required<string>();
  profile = signal<PlayerProfile | null>(null);

  async ngOnInit() {
    try { this.profile.set(await this.api.player(this.id())); } catch (err) { this.ui.error(err); }
  }
}
