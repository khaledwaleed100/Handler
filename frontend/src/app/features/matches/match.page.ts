import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { NgClass, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { Attendance, MatchWithPlayers, NotifyKind, PublicPlayer, RsvpStatus, TeamOption } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { RsvpCardComponent } from '../../shared/ui/rsvp-card.component';
import { PitchComponent } from '../../shared/ui/pitch.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { AvatarComponent } from '../../shared/ui/avatar.component';

type Tab = 'players' | 'teams' | 'checkin' | 'result';

@Component({
  selector: 'app-match',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, NgTemplateOutlet, FormsModule, RouterLink, TPipe, RsvpCardComponent, PitchComponent, IconComponent, AvatarComponent],
  templateUrl: './match.page.html'
})
export class MatchPage implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  ui = inject(Ui);
  auth = inject(AuthService);
  i18n = inject(I18n);

  id = input.required<string>();
  /** ?tab=result deep-links into a tab (from Home). */
  tabParam = input<Tab | undefined>(undefined, { alias: 'tab' });

  pitch = viewChild(PitchComponent);

  match = signal<MatchWithPlayers | null>(null);
  loading = signal(true);
  busy = signal(false);
  tab = signal<Tab>('players');
  notifyNote = '';
  notifyOpen = signal<NotifyKind | null>(null);

  // Teams editor
  options = signal<TeamOption[]>([]);
  optionIndex = signal<number | null>(null);
  draftA = signal<string[]>([]);
  draftB = signal<string[]>([]);
  extraPlayers = signal<Record<string, PublicPlayer>>({});
  dirty = signal(false);

  // Result editor
  scoreA = signal(0);
  scoreB = signal(0);
  scoreTouched = signal(false);
  goals = signal<Record<string, number>>({});
  assists = signal<Record<string, number>>({});

  // Organizer: everyone in the squad, for "add a player"
  squad = signal<PublicPlayer[]>([]);
  addPick = '';
  /** Organizer's starred players: listed first and addable with one tap. */
  favorites = signal<Set<string>>(new Set());

  isOrg = computed(() => this.auth.isOrganizer());
  players = computed(() => ({ ...(this.match()?.players ?? {}), ...this.extraPlayers() }));
  me = computed(() => this.auth.player()?._id ?? '');
  bench = computed(() => {
    const m = this.match();
    if (!m) return [];
    const inTeams = new Set([...this.draftA(), ...this.draftB()]);
    return m.rsvp.confirmed.filter(id => !inTeams.has(id));
  });
  played = computed(() => {
    const m = this.match();
    return m ? [...m.teamA, ...m.teamB] : [];
  });
  checkinList = computed(() => {
    const m = this.match();
    if (!m) return [];
    return [...new Set([...m.teamA, ...m.teamB, ...m.rsvp.confirmed])];
  });
  attendanceOf = (id: string): Attendance | undefined => this.match()?.attendance?.find(a => a.player === id);
  seenOf = (id: string) => !!this.match()?.seen?.includes(id);
  goalSum = computed(() => {
    const g = this.goals();
    const m = this.match();
    if (!m) return { a: 0, b: 0 };
    const sum = (ids: string[]) => ids.reduce((s, id) => s + (g[id] || 0), 0);
    return { a: sum(m.teamA), b: sum(m.teamB) };
  });
  unanswered = computed(() => {
    const m = this.match();
    if (!m) return [];
    const answered = new Set([...m.rsvp.confirmed, ...m.rsvp.waitlist, ...m.rsvp.maybe, ...m.rsvp.out]);
    const fav = this.favorites();
    return this.squad().filter(p => !answered.has(p._id)).sort((a, b) => Number(fav.has(b._id)) - Number(fav.has(a._id)));
  });
  favoriteUnanswered = computed(() => this.unanswered().filter(p => this.favorites().has(p._id)));
  tabs = computed<Tab[]>(() => {
    const m = this.match();
    if (!m) return [];
    if (m.status === 'completed') return ['result', 'checkin'];
    return ['players', 'teams', 'checkin', 'result'];
  });

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const m = await this.api.match(this.id());
      this.setMatch(m);
      const wanted = this.tabParam();
      this.tab.set(wanted && this.tabs().includes(wanted) ? wanted : this.tabs()[0]);
      if (this.isOrg()) {
        this.api.players().then(list => this.squad.set(list)).catch(() => {});
        this.api.favorites().then(ids => this.favorites.set(new Set(ids))).catch(() => {});
      }
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  private setMatch(m: MatchWithPlayers) {
    this.match.set(m);
    if (!this.dirty()) {
      this.draftA.set(m.teamA);
      this.draftB.set(m.teamB);
    }
    const g: Record<string, number> = {};
    const a: Record<string, number> = {};
    for (const s of m.stats) { g[s.player] = s.goals; a[s.player] = s.assists; }
    this.goals.set(g);
    this.assists.set(a);
    this.scoreA.set(m.score?.a ?? 0);
    this.scoreB.set(m.score?.b ?? 0);
    this.scoreTouched.set(!!m.score);
  }

  private async run(fn: () => Promise<MatchWithPlayers | void>, okText?: string) {
    this.busy.set(true);
    try {
      const res = await fn();
      if (res) this.setMatch(res);
      if (okText) this.ui.toast(okText);
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  // ── Players tab ──────────────────────────────────────
  setStatus(playerId: string, status: RsvpStatus | 'remove') {
    this.run(() => this.api.setRoster(this.id(), playerId, status));
  }
  addPlayer(status: RsvpStatus, id = this.addPick) {
    if (!id) return;
    if (id === this.addPick) this.addPick = '';
    const p = this.squad().find(x => x._id === id);
    if (p) this.extraPlayers.update(x => ({ ...x, [id]: p }));
    this.setStatus(id, status);
  }
  shareInvite() {
    const m = this.match()!;
    const when = this.i18n.date(m.kickoff, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const left = m.capacity - m.rsvp.confirmed.length;
    this.ui.share(`⚽ ${m.place} · ${when}\n${this.i18n.t('home.spots', { n: m.rsvp.confirmed.length, cap: m.capacity })}${left > 0 ? ` · ${this.i18n.t('home.spotsLeft', { n: left })}` : ''}\n${location.origin}/matches/${m._id}`);
  }

  // ── Teams tab ────────────────────────────────────────
  async suggest() {
    this.busy.set(true);
    try {
      const res = await this.api.suggestTeams(this.id());
      this.extraPlayers.update(x => ({ ...x, ...res.players }));
      this.options.set(res.options);
      this.pickOption(0);
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }
  pickOption(i: number) {
    const o = this.options()[i];
    if (!o) return;
    this.optionIndex.set(i);
    this.draftA.set(o.teamA);
    this.draftB.set(o.teamB);
    this.dirty.set(true);
    this.ui.haptic();
  }
  onPitchChange(e: { teamA: string[]; teamB: string[] }) {
    this.draftA.set(e.teamA);
    this.draftB.set(e.teamB);
    this.optionIndex.set(null);
    this.dirty.set(true);
  }
  async saveTeams(publish: boolean) {
    await this.run(async () => {
      const m = await this.api.saveTeams(this.id(), this.draftA(), this.draftB(), publish);
      this.dirty.set(false);
      return m;
    }, this.i18n.t(publish ? 'match.published' : 'app.saved'));
  }
  async shareTeams() {
    const m = this.match()!;
    const p = this.players();
    const avg = (ids: string[]) => ids.length ? Math.round(ids.reduce((s, id) => s + (p[id]?.overall ?? 60), 0) / ids.length) : 0;
    const names = (ids: string[]) => ids.map(id => p[id]?.name ?? '?').join('، ').replace(/، /g, this.i18n.lang() === 'ar' ? '، ' : ', ');
    const when = this.i18n.date(m.kickoff, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const text = `⚽ ${m.place} · ${when}\n\n🔴 ${this.i18n.t('match.teamA')} (${avg(this.draftA())}): ${names(this.draftA())}\n🔵 ${this.i18n.t('match.teamB')} (${avg(this.draftB())}): ${names(this.draftB())}`;

    let files: File[] | undefined;
    const el = this.pitch()?.el.nativeElement.querySelector('.pitch') as HTMLElement | null;
    if (el) {
      try {
        const { toBlob } = await import('html-to-image');
        const blob = await toBlob(el, { pixelRatio: 2, cacheBust: true });
        if (blob) files = [new File([blob], 'teams.png', { type: 'image/png' })];
      } catch { /* share text only */ }
    }
    await this.ui.share(text, files);
  }

  // ── Check-in tab ─────────────────────────────────────
  checkIn(playerId: string, state: 'arrived' | 'no_show' | 'clear') {
    this.ui.haptic();
    this.run(() => this.api.checkIn(this.id(), playerId, state));
  }

  // ── Result tab ───────────────────────────────────────
  bump(map: 'goals' | 'assists', id: string, delta: number) {
    const sig = map === 'goals' ? this.goals : this.assists;
    sig.update(v => ({ ...v, [id]: Math.max(0, (v[id] || 0) + delta) }));
    if (map === 'goals' && !this.scoreTouched()) {
      this.scoreA.set(this.goalSum().a);
      this.scoreB.set(this.goalSum().b);
    }
    this.ui.haptic(6);
  }
  setScore(side: 'a' | 'b', delta: number) {
    this.scoreTouched.set(true);
    const sig = side === 'a' ? this.scoreA : this.scoreB;
    sig.set(Math.max(0, sig() + delta));
  }
  readonly incA = () => this.setScore('a', 1);
  readonly decA = () => this.setScore('a', -1);
  readonly incB = () => this.setScore('b', 1);
  readonly decB = () => this.setScore('b', -1);

  saveResult() {
    const stats = this.played().map(id => ({ player: id, goals: this.goals()[id] || 0, assists: this.assists()[id] || 0 }))
      .filter(s => s.goals || s.assists);
    this.run(() => this.api.saveResult(this.id(), { a: this.scoreA(), b: this.scoreB() }, stats), this.i18n.t('match.resultSaved'));
  }
  closeRatings() {
    this.run(() => this.api.closeRatings(this.id()), this.i18n.t('match.ratingsClosed'));
  }

  // ── Notify the group ─────────────────────────────────
  readonly notifyKinds: { kind: NotifyKind; icon: string; label: string; hint: string }[] = [
    { kind: 'ask', icon: '🙋', label: 'match.notifyAsk', hint: 'match.notifyAskHint' },
    { kind: 'soon', icon: '⏱', label: 'match.notifySoon', hint: 'match.notifySoonHint' },
    { kind: 'message', icon: '📣', label: 'match.notifyMessage', hint: 'match.notifyMessageHint' },
    { kind: 'details', icon: '✉️', label: 'match.notifyDetails', hint: 'match.notifyDetailsHint' }
  ];

  lastSent(kind: NotifyKind) {
    const n = [...(this.match()?.notifications ?? [])].reverse().find(x => x.kind === kind);
    return n ? this.i18n.t('match.notifyLast', { t: this.i18n.duration(Date.now() - new Date(n.at).getTime()) }) : '';
  }

  async sendNotify(kind: NotifyKind) {
    this.busy.set(true);
    try {
      const res = await this.api.notify(this.id(), kind, this.notifyNote.trim() || undefined);
      this.setMatch(res.match);
      this.notifyOpen.set(null);
      this.notifyNote = '';
      this.ui.toast(this.i18n.t('match.notifySent', { n: res.recipients }));
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  // ── Match actions ────────────────────────────────────
  setRepeat(repeatWeekly: boolean) {
    this.run(() => this.api.updateMatch(this.id(), { repeatWeekly }), this.i18n.t('app.saved'));
  }
  async cancelMatch() {
    const ok = await this.ui.confirm({ title: this.i18n.t('match.cancelMatch'), body: this.i18n.t('match.cancelConfirm'), confirm: this.i18n.t('match.cancelMatch'), danger: true });
    if (ok) this.run(() => this.api.updateMatch(this.id(), { cancelled: true }));
  }
  async deleteMatch() {
    const ok = await this.ui.confirm({ title: this.i18n.t('match.deleteMatch'), body: this.i18n.t('match.deleteConfirm'), confirm: this.i18n.t('app.delete'), danger: true });
    if (!ok) return;
    await this.run(() => this.api.deleteMatch(this.id()).then(() => undefined));
    this.router.navigate(['/matches']);
  }

  name = (id: string) => this.players()[id]?.name ?? this.i18n.t('card.formerPlayer');
  time = (iso: string | null) => (iso ? this.i18n.date(iso, { hour: '2-digit', minute: '2-digit' }) : '');
  side = (id: string) => (this.match()?.teamA.includes(id) ? 'A' : this.match()?.teamB.includes(id) ? 'B' : '');
}
