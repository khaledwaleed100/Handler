import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgClass } from '@angular/common';
import { OUTFIELD_ATTRIBUTES, PublicPlayer } from '../../core/models';
import { TPipe } from '../../core/i18n/i18n.service';
import { ratingTier } from '../../core/util';
import { AvatarComponent } from './avatar.component';
import { CountUpDirective } from './count-up.directive';

/**
 * The player card, in two sizes:
 *  - "row":  compact list row (squad list, pickers)
 *  - "full": big profile card (own profile, player page)
 * Only positive public information is shown, never anything negative.
 */
@Component({
  selector: 'app-player-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, TPipe, AvatarComponent, CountUpDirective],
  template: `
    @if (variant() === 'row') {
      <div class="flex items-center gap-3 py-2.5">
        <div class="relative">
          <app-avatar [url]="player().avatarUrl" [name]="player().name" [size]="3" />
          <span class="absolute -bottom-1 -end-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-black text-white ring-2 ring-[var(--bg-elev)] num"
                [ngClass]="'tier-' + tier()">{{ player().overall }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="truncate font-bold">{{ player().name }}</span>
            @if (player().provisional) { <span class="chip !px-1.5 !py-0 text-[10px]">{{ 'card.provisional' | t }}</span> }
          </div>
          <div class="mt-0.5 flex items-center gap-2 text-xs muted">
            <span class="font-bold">{{ ('pos.short_' + player().position) | t }}</span>
            <span class="num">{{ player().stats.goals }} ⚽ · {{ player().stats.assists }} 👟 · {{ player().stats.matches }} {{ 'card.matches' | t }}</span>
          </div>
        </div>
        <div class="flex gap-0.5">
          @for (r of player().form.slice(-5); track $index) {
            <span class="h-2 w-2 rounded-full" [ngClass]="r === 'W' ? 'bg-emerald-500' : r === 'D' ? 'bg-slate-400' : 'bg-rose-500'"></span>
          }
        </div>
      </div>
    } @else {
      <div class="card overflow-hidden">
        <div class="relative p-5 text-white" [ngClass]="'tier-' + tier()">
          <div class="absolute inset-0 bg-gradient-to-b from-white/10 to-black/20"></div>
          <div class="relative flex items-center gap-4">
            <app-avatar [url]="player().avatarUrl" [name]="player().name" [size]="5" />
            <div class="min-w-0 flex-1">
              <div class="text-5xl font-black leading-none num" [countUp]="player().overall"></div>
              <div class="mt-1 truncate text-xl font-black">{{ player().name }}</div>
              <div class="text-sm font-bold opacity-90">{{ ('pos.' + player().position) | t }}</div>
            </div>
          </div>
          @if (player().provisional) {
            <div class="relative mt-3 inline-flex rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold">{{ 'card.provisionalHint' | t }}</div>
          }
        </div>

        <div class="grid grid-cols-5 gap-2 p-4">
          @for (a of attrs(); track a.key) {
            <div class="text-center">
              <div class="text-lg font-black num">{{ a.value }}</div>
              <div class="text-[10px] font-bold uppercase muted">{{ ('attr.short_' + a.key) | t }}</div>
              <div class="progress mt-1 !h-1"><div [style.width.%]="a.value"></div></div>
            </div>
          }
        </div>

        <div class="divider grid grid-cols-4 gap-2 p-4 text-center">
          <div><div class="text-xl font-black num">{{ player().stats.matches }}</div><div class="text-[11px] muted">{{ 'card.matches' | t }}</div></div>
          <div><div class="text-xl font-black num text-emerald-500">{{ player().stats.goals }}</div><div class="text-[11px] muted">{{ 'card.goals' | t }}</div></div>
          <div><div class="text-xl font-black num text-sky-500">{{ player().stats.assists }}</div><div class="text-[11px] muted">{{ 'card.assists' | t }}</div></div>
          <div><div class="text-xl font-black num text-amber-500">{{ player().stats.mvp }}</div><div class="text-[11px] muted">{{ 'card.mvps' | t }}</div></div>
        </div>

        @if (player().badges.length || player().form.length) {
          <div class="divider flex flex-wrap items-center gap-2 p-4">
            @for (b of player().badges; track b) {
              <span class="chip chip-primary">{{ badgeIcon[b] }} {{ ('badge.' + b) | t: { n: player().stats.mvp } }}</span>
            }
            @if (player().form.length) {
              <span class="ms-auto flex items-center gap-1">
                @for (r of player().form; track $index) {
                  <span class="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-black text-white"
                        [ngClass]="r === 'W' ? 'bg-emerald-500' : r === 'D' ? 'bg-slate-400' : 'bg-rose-500'">{{ r }}</span>
                }
              </span>
            }
          </div>
        }
      </div>
    }`
})
export class PlayerCardComponent {
  player = input.required<PublicPlayer>();
  variant = input<'row' | 'full'>('row');

  tier = computed(() => ratingTier(this.player().overall));
  attrs = computed(() => {
    const p = this.player();
    const keys = p.position === 'GK' ? (['goalkeeping', 'defence', 'passing', 'physical', 'pace'] as const) : OUTFIELD_ATTRIBUTES;
    return keys.map(key => ({ key, value: p.attrs?.[key] ?? 60 }));
  });

  readonly badgeIcon: Record<string, string> = { reliable: '⏱', mvp: '🏆', scorer: '⚽', playmaker: '🎯', veteran: '🎖️', hot: '🔥' };
}
