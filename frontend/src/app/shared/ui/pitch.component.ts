import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { Position, PublicPlayer } from '../../core/models';
import { TPipe } from '../../core/i18n/i18n.service';
import { Ui } from '../../core/ui.service';

type Side = 'A' | 'B' | 'bench';
interface Slot { id: string; side: Side }

/**
 * The green pitch.
 *
 * View mode: tap a card to flip it and see the player's attributes.
 * Edit mode (organizer): tap a player, then tap another to swap them, either
 * across teams or with someone on the bench. A live bar shows how even the teams are.
 * Portrait on phones (Team A on top), landscape on wide screens.
 */
@Component({
  selector: 'app-pitch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, NgTemplateOutlet, TPipe],
  template: `
    <!-- Strength bar -->
    @if (showStrength()) {
      <div class="mb-3">
        <div class="mb-1.5 flex items-center justify-between text-xs font-bold">
          <span style="color: var(--team-a)">{{ 'match.teamA' | t }} · {{ 'match.strength' | t: { n: strength().a } }}</span>
          <span class="chip" [ngClass]="strength().balance >= 95 ? 'chip-primary' : strength().balance >= 88 ? 'chip-warn' : 'chip-danger'">
            {{ 'match.balance' | t: { n: strength().balance } }}
          </span>
          <span style="color: var(--team-b)">{{ 'match.strength' | t: { n: strength().b } }} · {{ 'match.teamB' | t }}</span>
        </div>
        <div class="flex h-2 overflow-hidden rounded-full" style="background: var(--bg-sunk)">
          <div class="h-full transition-all duration-500" style="background: var(--team-a)" [style.width.%]="strength().shareA"></div>
          <div class="h-full flex-1" style="background: var(--team-b)"></div>
        </div>
      </div>
    }

    <div class="pitch" [class.landscape]="landscape()">
      <div class="pitch-lines">
        <div class="pitch-halfway"></div>
        <div class="pitch-circle"></div>
        <div class="pitch-box top"></div>
        <div class="pitch-box bottom"></div>
      </div>
      <div class="pitch-vs">{{ 'match.vs' | t }}</div>
      <span class="pitch-label start-3 top-3" [style.background]="'color-mix(in srgb, var(--team-a) 80%, black)'">{{ 'match.teamA' | t }}</span>
      <span class="pitch-label bottom-3 end-3" [ngClass]="landscape() ? 'md:bottom-auto md:top-3' : ''"
            [style.background]="'color-mix(in srgb, var(--team-b) 80%, black)'">{{ 'match.teamB' | t }}</span>

      <div class="absolute inset-0 z-10 flex flex-col px-1 py-8" [ngClass]="landscape() ? 'md:flex-row md:px-10 md:py-4' : ''">
        <!-- Team A half: back line (GK + DEF) near its goal, front line (MID + FWD) near halfway -->
        <div class="flex flex-1 flex-col justify-around" [ngClass]="landscape() ? 'md:flex-row' : ''">
          @for (line of lines().A; track $index) {
            @if (line.length) {
              <div class="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3" [ngClass]="landscape() ? 'md:flex-col' : ''">
                @for (id of line; track id) {
                  <ng-container *ngTemplateOutlet="card; context: { id: id, side: 'A' }" />
                }
              </div>
            }
          }
        </div>
        <!-- Empty strip on the halfway line where the VS badge sits; cards can't go here. -->
        <div class="h-12 shrink-0" [ngClass]="landscape() ? 'md:h-auto md:w-20' : ''" aria-hidden="true"></div>
        <!-- Team B half: mirrored -->
        <div class="flex flex-1 flex-col justify-around" [ngClass]="landscape() ? 'md:flex-row' : ''">
          @for (line of lines().B; track $index) {
            @if (line.length) {
              <div class="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3" [ngClass]="landscape() ? 'md:flex-col' : ''">
                @for (id of line; track id) {
                  <ng-container *ngTemplateOutlet="card; context: { id: id, side: 'B' }" />
                }
              </div>
            }
          }
        </div>
      </div>
    </div>

    <!-- Edit tools -->
    @if (editable()) {
      @if (selected(); as sel) {
        <div class="mt-3 flex flex-wrap items-center gap-2 rise">
          <span class="text-sm font-bold">{{ nameOf(sel.id) }}</span>
          @if (sel.side !== 'bench') {
            <button class="btn btn-sm btn-ghost" (click)="moveAcross(sel)">⇄ {{ (sel.side === 'A' ? 'match.teamB' : 'match.teamA') | t }}</button>
            <button class="btn btn-sm btn-ghost" (click)="toBench(sel)">{{ 'match.bench' | t }}</button>
          } @else {
            <button class="btn btn-sm btn-ghost" (click)="fromBench(sel, 'A')">+ {{ 'match.teamA' | t }}</button>
            <button class="btn btn-sm btn-ghost" (click)="fromBench(sel, 'B')">+ {{ 'match.teamB' | t }}</button>
          }
          <button class="btn btn-sm btn-ghost ms-auto" (click)="selected.set(null)">{{ 'app.cancel' | t }}</button>
        </div>
      } @else {
        <p class="hint text-center">{{ 'match.tapToSwap' | t }}</p>
      }
      @if (bench().length) {
        <div class="section-title">{{ 'match.bench' | t }}</div>
        <div class="flex flex-wrap gap-2">
          @for (id of bench(); track id) {
            <ng-container *ngTemplateOutlet="card; context: { id: id, side: 'bench' }" />
          }
        </div>
      }
    }

    <ng-template #card let-id="id" let-side="side">
      @let p = players()[id];
      <button type="button" class="pcard"
              [ngClass]="{ selected: isSelected(id), 'swap-target': isTarget(side) }"
              [attr.aria-label]="p?.name"
              (click)="tap(id, side)">
        @if (flipped().has(id) && p) {
          <div class="pcard-back pop">
            @for (a of backAttrs(p); track a.k) {
              <div><b class="num">{{ a.v }}</b><small>{{ ('attr.short_' + a.k) | t }}</small></div>
            }
          </div>
          <div class="pb-1 text-center text-[9px] font-black uppercase">{{ firstName(p.name) }}</div>
        } @else {
          <div class="pcard-top" [ngClass]="'pos-' + (p?.position || 'MID')">
            <span class="pcard-ovr num">{{ p?.overall ?? '–' }}</span>
            <span class="pcard-pos">{{ ('pos.short_' + (p?.position || 'MID')) | t }}</span>
            <span class="pcard-avatar">
              @if (p?.avatarUrl) { <img [src]="p!.avatarUrl" [alt]="p!.name" loading="lazy" crossorigin="anonymous" /> }
              @else { <span class="text-[11px] font-black text-white/80">{{ initials(p?.name) }}</span> }
            </span>
          </div>
          <div class="pcard-name">{{ p ? firstName(p.name) : ('card.formerPlayer' | t) }}</div>
        }
        @if (badgesFor(id); as b) {
          @if (b.goals || b.assists || b.mvp) {
            <span class="pcard-badges">
              @if (b.mvp) { <span>👑</span> }
              @if (b.goals) { <span>⚽{{ b.goals > 1 ? b.goals : '' }}</span> }
              @if (b.assists) { <span>👟{{ b.assists > 1 ? b.assists : '' }}</span> }
            </span>
          }
        }
      </button>
    </ng-template>
  `
})
export class PitchComponent {
  private ui = inject(Ui);
  readonly el = inject(ElementRef<HTMLElement>);

  teamA = input<string[]>([]);
  teamB = input<string[]>([]);
  bench = input<string[]>([]);
  players = input.required<Record<string, PublicPlayer>>();
  editable = input(false);
  landscape = input(true);
  showStrength = input(false);
  stats = input<{ player: string; goals: number; assists: number }[]>([]);
  mvp = input<string | null>(null);

  changed = output<{ teamA: string[]; teamB: string[] }>();

  readonly selected = signal<Slot | null>(null);
  readonly flipped = signal(new Set<string>());

  /**
   * Two lines per team so a phone-width half always fits:
   * back line = keeper + defenders, front line = midfielders + forwards.
   */
  lines = computed(() => {
    const split = (ids: string[]) => {
      const order: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
      const sorted = [...ids].sort((a, b) =>
        order.indexOf(this.players()[a]?.position ?? 'MID') - order.indexOf(this.players()[b]?.position ?? 'MID'));
      const isBack = (id: string) => ['GK', 'DEF'].includes(this.players()[id]?.position ?? 'MID');
      let back = sorted.filter(isBack);
      let front = sorted.filter(id => !isBack(id));
      // Keep lines even-ish when a team is all attackers or all defenders.
      while (back.length > front.length + 2) front = [back.pop()!, ...front];
      while (front.length > back.length + 2) back = [...back, front.shift()!];
      return { back, front };
    };
    const a = split(this.teamA());
    const b = split(this.teamB());
    return { A: [a.back, a.front], B: [b.front, b.back] };
  });

  strength = computed(() => {
    const avg = (ids: string[]) => ids.length ? ids.reduce((s, id) => s + (this.players()[id]?.overall ?? 60), 0) / ids.length : 0;
    const a = avg(this.teamA());
    const b = avg(this.teamB());
    const mean = (a + b) / 2 || 1;
    return {
      a: Math.round(a * 10) / 10,
      b: Math.round(b * 10) / 10,
      balance: Math.max(0, Math.round(100 * (1 - Math.abs(a - b) / mean))),
      shareA: a + b ? (a / (a + b)) * 100 : 50
    };
  });

  isSelected = (id: string) => this.selected()?.id === id;
  isTarget = (side: Side) => {
    const sel = this.selected();
    return !!sel && sel.side !== side;
  };

  tap(id: string, side: Side) {
    if (!this.editable()) {
      this.flipped.update(set => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    const sel = this.selected();
    if (!sel) { this.selected.set({ id, side }); this.ui.haptic(8); return; }
    if (sel.id === id) { this.selected.set(null); return; }
    this.swap(sel, { id, side });
  }

  private emit(a: string[], b: string[]) {
    this.selected.set(null);
    this.ui.haptic([8, 30, 8]);
    this.changed.emit({ teamA: a, teamB: b });
  }

  private swap(x: Slot, y: Slot) {
    const a = [...this.teamA()];
    const b = [...this.teamB()];
    const list = (s: Side) => (s === 'A' ? a : s === 'B' ? b : null);
    const lx = list(x.side);
    const ly = list(y.side);
    if (lx) lx[lx.indexOf(x.id)] = y.id;
    if (ly) ly[ly.indexOf(y.id)] = x.id;
    this.emit(a, b);
  }

  moveAcross(sel: Slot) {
    const a = this.teamA().filter(id => id !== sel.id);
    const b = this.teamB().filter(id => id !== sel.id);
    if (sel.side === 'A') b.push(sel.id); else a.push(sel.id);
    this.emit(a, b);
  }

  toBench(sel: Slot) {
    this.emit(this.teamA().filter(id => id !== sel.id), this.teamB().filter(id => id !== sel.id));
  }

  fromBench(sel: Slot, side: 'A' | 'B') {
    this.emit(side === 'A' ? [...this.teamA(), sel.id] : this.teamA(), side === 'B' ? [...this.teamB(), sel.id] : this.teamB());
  }

  badgesFor(id: string) {
    const s = this.stats().find(x => x.player === id);
    return { goals: s?.goals ?? 0, assists: s?.assists ?? 0, mvp: this.mvp() === id };
  }

  backAttrs(p: PublicPlayer) {
    const keys = p.position === 'GK' ? (['goalkeeping', 'defence', 'passing', 'pace'] as const) : (['pace', 'attack', 'passing', 'defence'] as const);
    return keys.map(k => ({ k, v: p.attrs?.[k] ?? 60 }));
  }

  nameOf = (id: string) => this.players()[id]?.name ?? '';
  firstName = (name: string) => name.split(' ')[0];
  initials = (name?: string) => (name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
