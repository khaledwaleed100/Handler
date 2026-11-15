import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18n, Lang, TPipe } from '../../core/i18n/i18n.service';
import { AttendanceRecord, Attributes, OUTFIELD_ATTRIBUTES, POSITIONS, Position, Preferences, PublicPlayer } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { ThemeService, Theme } from '../../core/theme.service';
import { PushService } from '../../core/services/push.service';
import { PwaService } from '../../core/services/pwa.service';
import { PlayerCardComponent } from '../../shared/ui/player-card.component';
import { SelfRatingComponent } from '../../shared/ui/self-rating.component';
import { AvatarComponent } from '../../shared/ui/avatar.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-me',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, FormsModule, RouterLink, TPipe, PlayerCardComponent, SelfRatingComponent, AvatarComponent, IconComponent],
  templateUrl: './me.page.html'
})
export class MePage implements OnInit {
  private api = inject(Api);
  ui = inject(Ui);
  auth = inject(AuthService);
  i18n = inject(I18n);
  theme = inject(ThemeService);
  push = inject(PushService);
  pwa = inject(PwaService);

  readonly positions = POSITIONS;
  readonly outfield = OUTFIELD_ATTRIBUTES;

  attendance = signal<AttendanceRecord[]>([]);
  prefs = signal<Preferences | null>(null);
  squad = signal<PublicPlayer[]>([]);
  disputing = signal<string | null>(null);
  disputeNote = '';
  busy = signal(false);
  uploading = signal(false);
  pickerFor = signal<'with' | 'avoid' | null>(null);

  // Profile form
  name = signal('');
  phone = signal('');
  position = signal<Position>('MID');
  selfRating = signal<Attributes>({ pace: 60, attack: 60, passing: 60, defence: 60, physical: 60, goalkeeping: 50 });
  feedbackText = '';

  player = computed(() => this.auth.player());
  others = computed(() => this.squad().filter(p => p._id !== this.player()?._id));
  nameOf = (id: string) => this.squad().find(p => p._id === id)?.name ?? '…';
  onTimeSummary = computed(() => {
    const r = this.player()?.reliability;
    if (!r) return null;
    const total = r.onTime + r.late + r.noShow;
    return total ? { a: r.onTime, b: total } : null;
  });
  /** Rows for "how your rating is made". */
  breakdown = computed(() => {
    const p = this.player();
    if (!p) return [];
    return this.outfield.map(k => ({
      key: k,
      self: p.selfRating?.[k] ?? 60,
      peer: p.peer?.attrs?.[k] ?? null,
      final: p.attrs?.[k] ?? 60
    }));
  });

  async ngOnInit() {
    const p = this.player();
    const u = this.auth.user();
    if (p && u) {
      this.name.set(u.name);
      this.phone.set(u.phone);
      this.position.set(p.position);
      this.selfRating.set({ ...p.selfRating });
    }
    this.push.refreshState();
    const [att, prefs, squad] = await Promise.allSettled([this.api.myAttendance(), this.api.preferences(), this.api.players()]);
    if (att.status === 'fulfilled') this.attendance.set(att.value);
    if (prefs.status === 'fulfilled') this.prefs.set(prefs.value);
    if (squad.status === 'fulfilled') this.squad.set(squad.value);
    this.auth.reloadMe().catch(() => {});
  }

  // ── Punctuality ─────────────────────────────────────
  async sendDispute(matchId: string) {
    if (this.disputeNote.trim().length < 3) return;
    this.busy.set(true);
    try {
      await this.api.dispute(matchId, this.disputeNote.trim());
      this.disputing.set(null);
      this.disputeNote = '';
      this.attendance.set(await this.api.myAttendance());
      this.ui.toast(this.i18n.t('match.disputeSent'));
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  // ── Preferences ─────────────────────────────────────
  togglePref(list: 'with' | 'avoid', id: string) {
    const p = this.prefs();
    if (!p) return;
    const current = p[list];
    const max = list === 'with' ? p.maxWith : p.maxAvoid;
    let next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    if (next.length > max) next = next.slice(-max);
    const other = list === 'with' ? 'avoid' : 'with';
    this.savePrefs({ ...p, [list]: next, [other]: p[other].filter(x => x !== id) });
  }

  private async savePrefs(p: Preferences) {
    this.prefs.set(p);
    this.ui.haptic();
    try {
      this.prefs.set(await this.api.setPreferences(p.with, p.avoid));
      this.ui.toast(this.i18n.t('me.prefsSaved'));
    } catch (err) {
      this.ui.error(err);
    }
  }

  // ── Profile ─────────────────────────────────────────
  async saveProfile() {
    this.busy.set(true);
    try {
      const me = await this.api.updateMe({ name: this.name().trim(), phone: this.phone().trim(), position: this.position(), selfRating: this.selfRating() });
      this.auth.applyMe(me);
      this.ui.toast(this.i18n.t('app.saved'));
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  async onPhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    try {
      await this.api.uploadAvatar(file);
      await this.auth.reloadMe();
    } catch (err) {
      this.ui.error(err);
    } finally {
      this.uploading.set(false);
      (e.target as HTMLInputElement).value = '';
    }
  }

  // ── App settings ────────────────────────────────────
  setLang(lang: Lang) {
    this.i18n.set(lang);
    this.api.updateMe({ lang }).then(me => this.auth.applyMe(me)).catch(() => {});
  }

  setTheme(t: Theme) {
    this.theme.set(t);
    this.api.updateMe({ theme: t }).then(me => this.auth.applyMe(me)).catch(() => {});
  }

  async toggleEmails() {
    const on = this.auth.user()?.preferences?.emailNotifications !== false;
    try {
      this.auth.applyMe(await this.api.updateMe({ emailNotifications: !on }));
    } catch (err) {
      this.ui.error(err);
    }
  }

  async toggleNotifications() {
    try {
      if (this.push.state() === 'on') await this.push.disable(); else await this.push.enable();
    } catch (err) {
      this.ui.error(err);
      this.push.refreshState();
    }
  }

  async install() {
    if (!(await this.pwa.install())) this.ui.toast(this.i18n.t('me.installHint'), 'info', 7000);
  }

  // ── Account ─────────────────────────────────────────
  async changePassword() {
    // People who joined with Google have no current password to type.
    const hasPassword = !!this.auth.user()?.hasPassword;
    const current = hasPassword
      ? await this.ui.confirm({ title: this.i18n.t('me.changePassword'), confirm: this.i18n.t('app.next'), input: { label: this.i18n.t('me.currentPassword'), type: 'password' } })
      : 'none';
    if (!current) return;
    const next = await this.ui.confirm({ title: this.i18n.t('me.changePassword'), body: this.i18n.t('auth.passwordHint'), confirm: this.i18n.t('app.save'), input: { label: this.i18n.t('auth.newPassword'), type: 'password' } });
    if (!next) return;
    try {
      await this.api.changePassword(current as string, next as string);
      await this.auth.reloadMe();
      this.ui.toast(this.i18n.t('app.saved'));
    } catch (err) {
      this.ui.error(err);
    }
  }

  async sendFeedback() {
    if (this.feedbackText.trim().length < 3) return;
    try {
      await this.api.feedback(this.feedbackText.trim());
      this.feedbackText = '';
      this.ui.toast(this.i18n.t('me.feedbackSent'));
    } catch (err) {
      this.ui.error(err);
    }
  }

  async deleteAccount() {
    const hasPassword = !!this.auth.user()?.hasPassword;
    const password = await this.ui.confirm({
      title: this.i18n.t('me.deleteAccount'), body: this.i18n.t('me.deleteHint'), confirm: this.i18n.t('app.delete'), danger: true,
      input: hasPassword
        ? { label: this.i18n.t('me.deleteConfirm'), type: 'password' }
        : { label: this.i18n.t('me.deleteConfirmEmail'), type: 'text' }
    });
    if (!password) return;
    try {
      await this.api.deleteAccount(password as string);
      this.auth.clear();
      location.href = '/login';
    } catch (err) {
      this.ui.error(err);
    }
  }
}
