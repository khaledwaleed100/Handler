import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { I18n, TPipe } from '../../core/i18n/i18n.service';
import { AdjustmentReason, GroupSettings, MemberView, OrganizerOverview } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { whatsappLink } from '../../core/util';
import { AvatarComponent } from '../../shared/ui/avatar.component';
import { IconComponent } from '../../shared/ui/icon.component';

const REASONS: AdjustmentReason[] = ['injury_return', 'new_player', 'plays_differently'];

@Component({
  selector: 'app-organizer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, FormsModule, RouterLink, TPipe, AvatarComponent, IconComponent],
  templateUrl: './organizer.page.html'
})
export class OrganizerPage implements OnInit {
  private api = inject(Api);
  ui = inject(Ui);
  i18n = inject(I18n);

  readonly reasons = REASONS;
  data = signal<OrganizerOverview | null>(null);
  settings: Partial<GroupSettings> = {};
  open = signal<string | null>(null);
  adjValue = signal(0);
  adjReason = signal<AdjustmentReason | null>(null);
  busy = signal(false);

  inviteLink = computed(() => (this.data() ? `${location.origin}/join/${this.data()!.settings.inviteCode}` : ''));
  /** Starred players first; the name order from the server is kept inside each group. */
  members = computed(() => [...(this.data()?.members ?? [])].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite)));
  memberName = (id: string) => this.data()?.members.find(m => m._id === id)?.name ?? this.i18n.t('card.formerPlayer');
  wa = whatsappLink;

  /** "Active 2h ago" / "Not active yet". */
  activeLabel(iso: string | null) {
    return iso ? this.i18n.t('org.lastSeen', { t: this.i18n.duration(Date.now() - new Date(iso).getTime()) }) : this.i18n.t('org.neverSeen');
  }

  statTiles = computed(() => {
    const s = this.data()?.stats;
    if (!s) return [];
    const of = (n: number) => `${n}/${s.members}`;
    const pc = (n: number | null) => (n === null ? '–' : `${n}%`);
    return [
      { label: 'org.active7', value: of(s.active7) },
      { label: 'org.active30', value: of(s.active30) },
      { label: 'org.pushOn', value: of(s.pushOn) },
      { label: 'org.replyRate', value: pc(s.replyRate) },
      { label: 'org.seenRate', value: pc(s.seenRate) },
      { label: 'org.ratingRate', value: pc(s.ratingRate) },
      { label: 'org.pollTurnout', value: pc(s.pollTurnout) },
      { label: 'org.google', value: of(s.google) }
    ];
  });

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      const d = await this.api.overview();
      this.data.set(d);
      this.settings = { ...d.settings };
    } catch (err) {
      this.ui.error(err);
    }
  }

  // Invite
  copyInvite() { this.ui.copy(this.inviteLink()); }
  shareInvite() { this.ui.share(this.i18n.t('org.inviteMessage', { link: this.inviteLink() })); }
  async resetInvite() {
    if (!(await this.ui.confirm({ title: this.i18n.t('org.resetInvite'), body: this.i18n.t('org.resetConfirm'), confirm: this.i18n.t('org.resetInvite'), danger: true }))) return;
    try {
      const s = await this.api.resetInvite();
      this.data.update(d => (d ? { ...d, settings: s } : d));
    } catch (err) { this.ui.error(err); }
  }

  async saveSettings() {
    this.busy.set(true);
    try {
      const s = await this.api.updateSettings({
        groupName: this.settings.groupName,
        lateGraceMinutes: Number(this.settings.lateGraceMinutes),
        defaultCapacity: Number(this.settings.defaultCapacity),
        ratingWindowHours: Number(this.settings.ratingWindowHours),
        autoReminders: this.settings.autoReminders !== false
      });
      this.data.update(d => (d ? { ...d, settings: s } : d));
      this.ui.toast(this.i18n.t('app.saved'));
    } catch (err) { this.ui.error(err); } finally { this.busy.set(false); }
  }

  // Disputes
  async decide(matchId: string, playerId: string, decision: 'accept' | 'reject') {
    try {
      await this.api.resolveDispute(matchId, playerId, decision);
      this.data.update(d => (d ? { ...d, disputes: d.disputes.filter(x => !(x.matchId === matchId && x.playerId === playerId)) } : d));
      this.ui.haptic();
    } catch (err) { this.ui.error(err); }
  }

  // Members
  toggle(m: MemberView) {
    if (this.open() === m._id) { this.open.set(null); return; }
    this.open.set(m._id);
    this.adjValue.set(m.adjustment);
    this.adjReason.set(m.adjustmentReason);
  }

  async saveAdjustment(m: MemberView) {
    this.busy.set(true);
    try {
      const updated = await this.api.setAdjustment(m._id, this.adjValue(), this.adjValue() === 0 ? null : this.adjReason());
      this.data.update(d => (d ? { ...d, members: d.members.map(x => (x._id === m._id ? { ...updated, usage: x.usage, favorite: x.favorite } : x)) } : d));
      this.ui.toast(this.i18n.t('app.saved'));
    } catch (err) { this.ui.error(err); } finally { this.busy.set(false); }
  }

  async toggleFavorite(m: MemberView) {
    const favorite = !m.favorite;
    this.ui.haptic();
    const apply = (value: boolean) => this.data.update(d => (d ? { ...d, members: d.members.map(x => (x._id === m._id ? { ...x, favorite: value } : x)) } : d));
    apply(favorite);
    try { await this.api.setFavorite(m._id, favorite); } catch (err) { apply(!favorite); this.ui.error(err); }
  }

  async remove(m: MemberView) {
    const ok = await this.ui.confirm({ title: this.i18n.t('org.removeMember'), body: this.i18n.t('org.removeConfirm', { name: m.name }), confirm: this.i18n.t('match.remove'), danger: true });
    if (!ok) return;
    try {
      await this.api.removeMember(m._id);
      this.data.update(d => (d ? { ...d, members: d.members.filter(x => x._id !== m._id) } : d));
    } catch (err) { this.ui.error(err); }
  }
}
