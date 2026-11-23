import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { CacheService, Cached } from './cache.service';
import { AuthService } from './auth.service';
import {
  AdjustmentReason, AttendanceRecord, Attributes, GroupSettings, Home, Match, MatchList, MatchWithPlayers, Me,
  MemberView, NotifyKind, OrganizerOverview, PlayerProfile, Position, Preferences, PublicPlayer, RatingTask, RsvpStatus, TeamOption
} from './models';

/** Changes that don't affect what any screen shows, so they keep the saved screens. */
const NO_SCREEN_CHANGE = /^\/me\/(push|feedback|preferences)/;

/**
 * Every API call in one place. Returns promises, which read nicely with async/await in screens.
 * Every answer is remembered (see CacheService), so a screen can show the last one instantly
 * through `cached` while it asks the server for a fresh one.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private cache = inject(CacheService);
  private auth = inject(AuthService);
  private base = environment.apiUrl;

  private async get<T>(path: string, params?: Record<string, string>) {
    const data = await firstValueFrom(this.http.get<T>(`${this.base}${path}`, { params }));
    this.cache.put(cacheKey(path, params), data);
    return data;
  }
  private async changed<T>(request: Promise<T>, path: string) {
    const res = await request;
    if (!NO_SCREEN_CHANGE.test(path)) this.cache.invalidate();
    return res;
  }
  private post<T>(path: string, body: unknown = {}) {
    return this.changed(firstValueFrom(this.http.post<T>(`${this.base}${path}`, body)), path);
  }
  private put<T>(path: string, body: unknown) {
    return this.changed(firstValueFrom(this.http.put<T>(`${this.base}${path}`, body)), path);
  }
  private del<T>(path: string, body?: unknown) {
    return this.changed(firstValueFrom(this.http.delete<T>(`${this.base}${path}`, { body })), path);
  }

  /** The last answer for a screen (or null), to show while the fresh one loads. */
  readonly cached = {
    home: () => this.cache.peek<Home>('/home'),
    matches: (scope: 'upcoming' | 'past') => this.cache.peek<MatchList>(cacheKey('/matches', { scope })),
    match: (id: string) => this.cache.peek<MatchWithPlayers>(`/matches/${id}`),
    players: () => this.cache.peek<PublicPlayer[]>('/players'),
    player: (id: string) => this.cache.peek<PlayerProfile>(`/players/${id}`),
    overview: () => this.cache.peek<OrganizerOverview>('/organizer/overview')
  } satisfies Record<string, (...args: never[]) => Cached<unknown> | null>;

  /**
   * Whether to put a saved copy on screen straight away. Up-to-date copies: always. Copies from
   * before a change: only while the app is still confirming the session (just opened, server
   * waking up), so a reply you just made never flashes back to the old answer.
   * Any saved copy is still used when the server can't be reached.
   */
  showNow<T>(saved: Cached<T> | null): saved is Cached<T> {
    return !!saved && (!saved.stale || this.auth.provisional());
  }

  /** Updates the saved copy after a screen changed its own data (e.g. a reply on Home). */
  remember = {
    home: (h: Home) => this.cache.put('/home', h),
    match: (m: MatchWithPlayers) => this.cache.put(`/matches/${m._id}`, m)
  };

  // Home & settings
  home() { return this.get<Home>('/home'); }
  settings() { return this.get<{ groupName: string; lateGraceMinutes: number }>('/settings'); }
  config() { return this.get<{ googleClientId: string | null }>('/config'); }

  // Me
  me() { return this.get<Me>('/me'); }
  updateMe(body: Partial<{ name: string; phone: string; position: Position; selfRating: Attributes; lang: 'en' | 'ar'; theme: 'light' | 'dark'; emailNotifications: boolean }>) {
    return this.put<Me>('/me', body);
  }
  changePassword(currentPassword: string, newPassword: string) { return this.put<{ ok: boolean }>('/me/password', { currentPassword, newPassword }); }
  uploadAvatar(file: File) {
    const form = new FormData();
    form.append('avatar', file);
    return this.post<{ avatarUrl: string }>('/me/avatar', form);
  }
  preferences() { return this.get<Preferences>('/me/preferences'); }
  setPreferences(withIds: string[], avoid: string[]) { return this.put<Preferences>('/me/preferences', { with: withIds, avoid }); }
  myAttendance() { return this.get<AttendanceRecord[]>('/me/attendance'); }
  dispute(matchId: string, note: string) { return this.post<{ ok: boolean }>(`/me/attendance/${matchId}/dispute`, { note }); }
  addPush(subscription: PushSubscriptionJSON) { return this.post<{ ok: boolean }>('/me/push', { subscription }); }
  removePush(endpoint: string) { return this.del<{ ok: boolean }>('/me/push', { endpoint }); }
  feedback(message: string) { return this.post<{ ok: boolean }>('/me/feedback', { message }); }
  deleteAccount(password: string) { return this.del<{ ok: boolean }>('/me', { password }); }

  // Squad
  players() { return this.get<PublicPlayer[]>('/players'); }
  player(id: string) { return this.get<PlayerProfile>(`/players/${id}`); }

  // Matches
  matches(scope: 'upcoming' | 'past') { return this.get<MatchList>('/matches', { scope }); }
  match(id: string) { return this.get<MatchWithPlayers>(`/matches/${id}`); }
  createMatch(body: { place: string; mapUrl?: string; kickoff: string; capacity?: number; repeatWeekly?: boolean }) { return this.post<MatchWithPlayers>('/matches', body); }
  updateMatch(id: string, body: Record<string, unknown>) { return this.put<MatchWithPlayers>(`/matches/${id}`, body); }
  deleteMatch(id: string) { return this.del<{ ok: boolean }>(`/matches/${id}`); }
  rsvp(id: string, status: RsvpStatus) { return this.post<MatchWithPlayers>(`/matches/${id}/rsvp`, { status }); }
  setRoster(id: string, playerId: string, status: RsvpStatus | 'remove') { return this.post<MatchWithPlayers>(`/matches/${id}/roster`, { playerId, status }); }
  suggestTeams(id: string) { return this.post<{ options: TeamOption[]; players: Record<string, PublicPlayer> }>(`/matches/${id}/teams/suggest`); }
  saveTeams(id: string, teamA: string[], teamB: string[], publish: boolean) { return this.put<MatchWithPlayers>(`/matches/${id}/teams`, { teamA, teamB, publish }); }
  checkIn(id: string, playerId: string, state: 'arrived' | 'no_show' | 'clear', minutesLate?: number) {
    return this.post<MatchWithPlayers>(`/matches/${id}/checkin`, { playerId, state, minutesLate });
  }
  saveResult(id: string, score: { a: number; b: number }, stats: { player: string; goals: number; assists: number }[]) {
    return this.post<MatchWithPlayers>(`/matches/${id}/result`, { score, stats });
  }
  notify(id: string, kind: NotifyKind, note?: string) {
    return this.post<{ recipients: number; match: MatchWithPlayers }>(`/matches/${id}/notify`, { kind, note });
  }
  ratingTask(id: string) { return this.get<RatingTask>(`/matches/${id}/rating-task`); }
  submitRatings(id: string, ratings: { ratee: string; scores: Partial<Attributes>; playAgain: boolean }[], mvp: string | null) {
    return this.post<{ ok: boolean }>(`/matches/${id}/ratings`, { ratings, mvp });
  }
  closeRatings(id: string) { return this.post<MatchWithPlayers>(`/matches/${id}/finalize-ratings`); }

  // Organizer
  overview() { return this.get<OrganizerOverview>('/organizer/overview'); }
  updateSettings(body: Partial<GroupSettings>) { return this.put<GroupSettings>('/organizer/settings', body); }
  testEmail() { return this.post<{ ok: boolean; method: string; to: string }>('/organizer/test-email'); }
  resetInvite() { return this.post<GroupSettings>('/organizer/invite/reset'); }
  setAdjustment(playerId: string, value: number, reason: AdjustmentReason | null) {
    return this.put<MemberView>(`/organizer/players/${playerId}/adjustment`, { value, reason });
  }
  favorites() { return this.get<string[]>('/organizer/favorites'); }
  setFavorite(playerId: string, favorite: boolean) { return this.put<string[]>(`/organizer/players/${playerId}/favorite`, { favorite }); }
  removeMember(playerId: string) { return this.del<{ ok: boolean }>(`/organizer/players/${playerId}`); }
  resolveDispute(matchId: string, playerId: string, decision: 'accept' | 'reject') {
    return this.post<{ ok: boolean }>('/organizer/disputes', { matchId, playerId, decision });
  }
}

const cacheKey = (path: string, params?: Record<string, string>) =>
  params ? `${path}?${new URLSearchParams(params)}` : path;

export type { Match };
