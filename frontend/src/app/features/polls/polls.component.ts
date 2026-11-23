import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { Poll, PollCandidate, PollService, PollStatus, PollType } from '../../core/services/poll.service';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { Ui } from '../../core/ui.service';
import { Api } from '../../core/api.service';
import { AvatarComponent } from '../../shared/ui/avatar.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { CountUpDirective } from '../../shared/ui/count-up.directive';
import { PullToRefreshDirective } from '../../shared/ui/pull-to-refresh.directive';
import { celebrate } from '../../core/celebrate';
import { LiveService } from '../../core/services/live.service';

/**
 * Player of the Week / Month and Team of the Week voting.
 * Two-step vote (tap, then confirm) so nobody votes by accident; results update live.
 * A closed poll shows a congratulations card that can be shared as a picture.
 * The organizer can start and end polls from here.
 */
@Component({
  selector: 'app-polls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, TPipe, AvatarComponent, IconComponent, SkeletonComponent, CountUpDirective, PullToRefreshDirective],
  template: `
    <div class="page" [pullToRefresh]="reload">
      <header class="mb-4">
        <h1 class="page-title">{{ 'poll.title' | t }}</h1>
        <p class="text-sm muted">{{ 'poll.subtitle' | t }}</p>
      </header>

      @if (!polls.loaded() && slow()) {
        <p class="card card-pad mb-4 text-sm">⚡ {{ 'poll.waking' | t }}</p>
      }

      <!-- Organizer: start a poll -->
      @if (auth.isOrganizer() && status(); as s) {
        <div class="mb-5 grid grid-cols-2 gap-2">
          @for (type of types; track type) {
            @let st = s[type];
            <div class="card card-pad">
              <div class="text-sm font-black">{{ ('poll.' + type) | t }}</div>
              <div class="progress my-2"><div [style.width.%]="(st.completed / st.required) * 100"></div></div>
              <div class="mb-2 text-xs muted">{{ 'poll.progress' | t: { done: st.completed, need: st.required } }}</div>
              @if (st.canGenerate) {
                <button class="btn btn-sm btn-primary btn-block" [disabled]="busy()" (click)="start(type, false)">{{ 'poll.start' | t: { type: '' } }}</button>
              } @else if (st.canForce) {
                <button class="btn btn-sm btn-ghost btn-block" [disabled]="busy()" (click)="start(type, true)">{{ 'poll.startEarly' | t }}</button>
              }
            </div>
          }
        </div>
      }

      @if (!polls.loaded()) {
        <div class="skeleton mb-3 h-28 !rounded-3xl"></div>
        <app-skeleton kind="rows" [count]="5" />
      } @else if (!polls.polls().length) {
        <div class="card card-pad text-center">
          <div class="text-5xl">🗳️</div>
          <p class="mt-2 font-bold">{{ 'poll.none' | t }}</p>
          <p class="text-sm muted">{{ 'poll.noneHint' | t }}</p>
        </div>
      }

      @for (poll of polls.polls(); track poll._id) {
        <article class="mb-8 rise">
          <div class="relative mb-3 overflow-hidden rounded-3xl p-5 text-white shadow-xl"
               [ngClass]="poll.isActive ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500' : 'bg-gradient-to-br from-slate-600 to-slate-800'">
            <div class="pointer-events-none absolute -end-4 -top-6 text-[110px] leading-none opacity-15">🏆</div>
            <span class="relative rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider">
              {{ (poll.isActive ? 'poll.live' : 'poll.closed') | t }}
            </span>
            <h2 class="relative mt-2 text-2xl font-black">{{ ('poll.' + poll.type) | t }}</h2>
            <p class="relative text-xs font-semibold opacity-90">{{ 'poll.votes' | t: { n: poll.totalVotes } }}</p>
          </div>

          @let winners = winnersOf(poll);
          @if (!poll.isActive && winners.length) {
            <div class="mb-3 pop">
              <!-- The congratulations card: this box is what gets shared as a picture. -->
              <div [id]="'card-' + poll._id" class="relative overflow-hidden rounded-3xl p-6 text-center text-white"
                   style="background: linear-gradient(145deg, #f59e0b, #ea580c 55%, #be123c)">
                <div class="text-[11px] font-black uppercase tracking-[0.2em] opacity-90">{{ groupName() }}</div>
                <div class="mt-1 text-2xl font-black">🏆 {{ titleOf(poll) }}</div>
                @if (poll.picks === 1) {
                  @let w = winners[0];
                  <div class="mx-auto mt-4 w-fit rounded-full p-1.5" style="background: rgba(255,255,255,.3)">
                    <app-avatar [url]="w.avatarUrl" [name]="w.name" [size]="7" />
                  </div>
                  <div class="mt-3 text-3xl font-black leading-tight">{{ 'poll.congrats' | t: { name: w.name } }}</div>
                  <div class="mt-1 text-sm font-semibold opacity-90">{{ 'poll.congratsSub' | t: { title: titleOf(poll) } }}</div>
                  <div class="mt-4 flex flex-wrap justify-center gap-2 text-sm font-black num">
                    <span class="rounded-full bg-black/20 px-3 py-1">⚽ {{ w.goals }}</span>
                    <span class="rounded-full bg-black/20 px-3 py-1">👟 {{ w.assists }}</span>
                    <span class="rounded-full bg-black/20 px-3 py-1">⭐ {{ w.avgRating.toFixed(1) }}</span>
                    <span class="rounded-full bg-black/20 px-3 py-1">🗳️ {{ w.votes }}</span>
                  </div>
                } @else {
                  <div class="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-4">
                    @for (w of winners; track w._id) {
                      <div class="w-[4.75rem]">
                        <div class="mx-auto w-fit rounded-full p-1" style="background: rgba(255,255,255,.3)">
                          <app-avatar [url]="w.avatarUrl" [name]="w.name" [size]="3.5" />
                        </div>
                        <div class="mt-1 truncate text-xs font-black">{{ w.name }}</div>
                        <div class="text-[10px] font-bold opacity-90">{{ ('pos.short_' + w.position) | t }} · 🗳️ {{ w.votes }}</div>
                      </div>
                    }
                  </div>
                  <div class="mt-4 text-sm font-semibold opacity-90">{{ 'poll.congratsSub' | t: { title: titleOf(poll) } }}</div>
                }
              </div>
              <button class="btn btn-soft btn-block mt-2" [disabled]="sharing()" (click)="shareCard(poll)">
                <app-icon name="share" [size]="18" /> {{ 'poll.shareCard' | t }}
              </button>
            </div>
          }

          @if (poll.isActive && !poll.hasVoted) {
            <p class="mb-2 px-1 text-xs font-bold uppercase tracking-wider muted">
              {{ poll.picks > 1 ? ('poll.pickUpTo' | t: { n: poll.picks }) : ('poll.tapThenConfirm' | t) }}
            </p>
          }

          <div class="flex flex-col gap-2" [attr.role]="poll.picks > 1 ? 'group' : 'radiogroup'">
            @for (c of poll.candidates; track c._id; let i = $index) {
              <button type="button" [attr.role]="poll.picks > 1 ? 'checkbox' : 'radio'" class="card relative flex min-h-[4.75rem] items-center gap-3 overflow-hidden px-3.5 py-3 text-start transition"
                      [attr.aria-checked]="isPicked(poll, c) || poll.myVotes.includes(c._id)"
                      [disabled]="!canVote(poll) || voting()"
                      [ngClass]="isPicked(poll, c) ? '!border-amber-400 ring-2 ring-amber-400' : poll.winnerIds.includes(c._id) ? '!border-amber-400' : ''"
                      (click)="pick(poll, c)">
                @if (showResults(poll)) {
                  <span class="absolute inset-y-0 start-0 transition-all duration-700" style="background: var(--primary-soft)" [style.width.%]="c.percent"></span>
                }
                <span class="relative w-5 text-center text-sm font-black muted">{{ i + 1 }}</span>
                <app-avatar class="relative" [url]="c.avatarUrl" [name]="c.name" [size]="3" />
                <span class="relative min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span class="truncate text-base font-black">{{ c.name }}</span>
                    @if (poll.winnerIds.includes(c._id)) { 👑 }
                    @if (poll.myVotes.includes(c._id)) { <span class="chip chip-primary !px-1.5 !py-0 text-[10px]">{{ 'poll.you' | t }}</span> }
                  </span>
                  <span class="text-xs font-semibold muted">{{ ('pos.short_' + c.position) | t }} · ⚽ {{ c.goals }} · 👟 {{ c.assists }}</span>
                </span>
                <span class="relative text-end">
                  @if (showResults(poll)) {
                    <span class="block text-2xl font-black leading-none num"><span [countUp]="c.percent"></span>%</span>
                    <span class="text-[11px] font-semibold muted">{{ 'poll.votes' | t: { n: c.votes } }}</span>
                  } @else {
                    <span class="block text-2xl font-black leading-none text-amber-500 num">{{ c.avgRating.toFixed(1) }}</span>
                    <span class="text-[10px] font-bold uppercase muted">{{ 'poll.rating' | t }}</span>
                  }
                </span>
              </button>
            }
          </div>

          @if (showResults(poll) && poll.isActive) {
            <p class="mt-3 text-center text-xs font-semibold muted">✅ {{ 'poll.voted' | t }}</p>
          }

          @if (poll.canManage && poll.isActive) {
            @if (closingId() !== poll._id) {
              <button class="btn btn-ghost btn-block mt-4 border-2 border-dashed" style="border-color: var(--border)" (click)="closingId.set(poll._id)">🏁 {{ 'poll.endPoll' | t }}</button>
            } @else {
              <div class="mt-4 grid grid-cols-2 gap-2">
                <button class="btn btn-ghost" (click)="closingId.set(null)">{{ 'poll.keepOpen' | t }}</button>
                <button class="btn btn-primary" [disabled]="busy()" (click)="close(poll)">{{ 'poll.yesEnd' | t }}</button>
              </div>
            }
          }
        </article>
      }
    </div>

    <!-- Confirm bar, above the tab bar, in thumb reach -->
    @if (picked(); as p) {
      <div class="fixed inset-x-0 z-30 px-4 rise" style="bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 0.5rem)">
        <div class="card mx-auto flex max-w-2xl items-center gap-3 p-3 shadow-2xl">
          <div class="min-w-0 flex-1">
            <div class="text-[11px] font-black uppercase tracking-wider muted">
              {{ p.max > 1 ? ('poll.pickedCount' | t: { n: p.candidates.length, max: p.max }) : ('poll.yourPick' | t) }}
            </div>
            <div class="truncate font-black" [ngClass]="p.max > 1 ? 'text-sm' : 'text-lg'">{{ pickedNames() }}</div>
          </div>
          <button class="icon-btn" (click)="picked.set(null)" [disabled]="voting()" [attr.aria-label]="'app.cancel' | t">✕</button>
          <button class="btn btn-primary" (click)="confirm()" [disabled]="voting()">{{ 'poll.confirmVote' | t }}</button>
        </div>
      </div>
    }`
})
export class PollsComponent implements OnInit, OnDestroy {
  polls = inject(PollService);
  auth = inject(AuthService);
  private ui = inject(Ui);
  private i18n = inject(I18n);
  private api = inject(Api);

  readonly types: PollType[] = ['weekly', 'team', 'monthly'];
  status = signal<PollStatus | null>(null);
  /** The ballot being built: one player, or up to `max` for Team of the Week. */
  picked = signal<{ pollId: string; max: number; candidates: PollCandidate[] } | null>(null);
  pickedNames = computed(() => (this.picked()?.candidates ?? []).map(c => c.name).join(', '));
  groupName = signal('');
  sharing = signal(false);
  voting = signal(false);
  busy = signal(false);
  closingId = signal<string | null>(null);
  slow = signal(false);
  private slowTimer?: ReturnType<typeof setTimeout>;

  readonly reload = () => this.polls.refresh();

  constructor() {
    inject(LiveService).on(['polls'], () => this.polls.refresh().catch(() => {}));
    // Confetti the first time this phone sees a poll's winners (bigger if you're one of them).
    effect(() => {
      const fresh = this.polls.polls().filter(p => !p.isActive && p.winnerIds.length && !celebrated().includes(p._id));
      if (!fresh.length) return;
      remember(fresh.map(p => p._id));
      const me = this.auth.player()?._id;
      const mine = !!me && fresh.some(p => p.winnerIds.includes(me));
      setTimeout(() => celebrate({ count: mine ? 220 : 140 }), 350);
    });
  }

  ngOnInit() {
    this.slowTimer = setTimeout(() => this.slow.set(true), 4000);
    this.polls.refresh().catch(err => this.ui.error(err));
    this.polls.startLive();
    if (this.auth.isOrganizer()) this.loadStatus();
    this.api.settings().then(s => this.groupName.set(s.groupName)).catch(() => {});
  }

  ngOnDestroy() {
    this.polls.stopLive();
    clearTimeout(this.slowTimer);
  }

  private async loadStatus() {
    try { this.status.set(await this.polls.getStatus()); } catch { /* optional */ }
  }

  canVote = (poll: Poll) => poll.isActive && !poll.hasVoted;
  showResults = (poll: Poll) => poll.hasVoted || !poll.isActive;
  isPicked = (poll: Poll, c: PollCandidate) => this.picked()?.pollId === poll._id && !!this.picked()?.candidates.some(x => x._id === c._id);
  /** Crowned players in winning order. */
  winnersOf = (poll: Poll) => poll.winnerIds.map(id => poll.candidates.find(c => c._id === id)).filter((c): c is PollCandidate => !!c);
  titleOf = (poll: Poll) => this.i18n.t('poll.' + poll.type);

  pick(poll: Poll, c: PollCandidate) {
    if (!this.canVote(poll)) return;
    const current = this.picked()?.pollId === poll._id ? this.picked()!.candidates : [];
    let next: PollCandidate[];
    if (current.some(x => x._id === c._id)) next = current.filter(x => x._id !== c._id);
    else if (poll.picks === 1) next = [c];
    else if (current.length >= poll.picks) return; // ballot is full: un-tap someone first
    else next = [...current, c];
    this.ui.haptic();
    this.picked.set(next.length ? { pollId: poll._id, max: poll.picks, candidates: next } : null);
  }

  /** Turns the congratulations card into a picture and opens the phone's share sheet (WhatsApp, email, …). */
  async shareCard(poll: Poll) {
    const winners = this.winnersOf(poll);
    if (!winners.length) return;
    const title = this.titleOf(poll);
    const text = poll.picks === 1
      ? this.i18n.t('poll.congratsText', { name: winners[0].name, title })
      : this.i18n.t('poll.teamText', { title, names: winners.map(w => w.name).join(', ') });

    this.sharing.set(true);
    try {
      let files: File[] | undefined;
      const el = document.getElementById('card-' + poll._id);
      if (el) {
        try {
          const { toBlob } = await import('html-to-image');
          const blob = await toBlob(el, { pixelRatio: 2, cacheBust: true });
          if (blob) files = [new File([blob], 'congrats.png', { type: 'image/png' })];
        } catch { /* share the text only */ }
      }
      // Browsers that can't share a picture (most desktops): save it, so it can be attached by hand.
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (files && !nav.canShare?.({ files })) {
        const url = URL.createObjectURL(files[0]);
        const a = document.createElement('a');
        a.href = url;
        a.download = files[0].name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      await this.ui.share(text, files);
    } finally {
      this.sharing.set(false);
    }
  }

  async confirm() {
    const p = this.picked();
    if (!p) return;
    this.voting.set(true);
    try {
      await this.polls.vote(p.pollId, p.candidates.map(c => c._id));
      this.ui.haptic([10, 40, 10]);
      this.picked.set(null);
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.voting.set(false);
    }
  }

  async start(type: PollType, force: boolean) {
    this.busy.set(true);
    try {
      await this.polls.generate(type, force);
      await this.loadStatus();
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  async close(poll: Poll) {
    this.busy.set(true);
    try {
      await this.polls.close(poll._id); // the winners' confetti comes from the check in the constructor
      this.closingId.set(null);
      await this.loadStatus();
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  readonly pendingLabel = computed(() => this.i18n.t('poll.title'));
}

/** Poll ids this phone already celebrated (so confetti plays once, not on every visit). */
const CELEBRATED = 'celebrated:v1';
const celebrated = (): string[] => {
  try { return JSON.parse(localStorage.getItem(CELEBRATED) || '[]'); } catch { return []; }
};
const remember = (ids: string[]) => {
  try { localStorage.setItem(CELEBRATED, JSON.stringify([...celebrated(), ...ids].slice(-30))); } catch { /* storage blocked */ }
};
