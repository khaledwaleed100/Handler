import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AdjustmentReason, AttendanceRecord, Attributes, GroupSettings, Home, Match, MatchList, MatchWithPlayers, Me,
  MemberView, OrganizerOverview, PlayerProfile, Position, Preferences, PublicPlayer, RatingTask, RsvpStatus, TeamOption
} from './models';

/** Every API call in one place. Returns promises, which read nicely with async/await in screens. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  private get<T>(path: string, params?: Record<string, string>) {
    return firstValueFrom(this.http.get<T>(`${this.base}${path}`, { params }));
  }
  private post<T>(path: string, body: unknown = {}) {
    return firstValueFrom(this.http.post<T>(`${this.base}${path}`, body));
  }
  private put<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.put<T>(`${this.base}${path}`, body));
  }
  private del<T>(path: string, body?: unknown) {
    return firstValueFrom(this.http.delete<T>(`${this.base}${path}`, { body }));
  }

  // Home & settings
  home() { return this.get<Home>('/home'); }
  settings() { return this.get<{ groupName: string; currency: string; lateGraceMinutes: number }>('/settings'); }

  // Me
  me() { return this.get<Me>('/me'); }
  updateMe(body: Partial<{ name: string; phone: string; position: Position; selfRating: Attributes; lang: 'en' | 'ar'; theme: 'light' | 'dark' }>) {
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
  createMatch(body: { place: string; mapUrl?: string; kickoff: string; capacity?: number; price?: number }) { return this.post<MatchWithPlayers>('/matches', body); }
  updateMatch(id: string, body: Record<string, unknown>) { return this.put<MatchWithPlayers>(`/matches/${id}`, body); }
  deleteMatch(id: string) { return this.del<{ ok: boolean }>(`/matches/${id}`); }
  rsvp(id: string, status: RsvpStatus) { return this.post<MatchWithPlayers>(`/matches/${id}/rsvp`, { status }); }
  setRoster(id: string, playerId: string, status: RsvpStatus | 'remove') { return this.post<MatchWithPlayers>(`/matches/${id}/roster`, { playerId, status }); }
  suggestTeams(id: string) { return this.post<{ options: TeamOption[]; players: Record<string, PublicPlayer> }>(`/matches/${id}/teams/suggest`); }
  saveTeams(id: string, teamA: string[], teamB: string[], publish: boolean) { return this.put<MatchWithPlayers>(`/matches/${id}/teams`, { teamA, teamB, publish }); }
  checkIn(id: string, playerId: string, state: 'arrived' | 'no_show' | 'clear') { return this.post<MatchWithPlayers>(`/matches/${id}/checkin`, { playerId, state }); }
  saveResult(id: string, score: { a: number; b: number }, stats: { player: string; goals: number; assists: number }[]) {
    return this.post<MatchWithPlayers>(`/matches/${id}/result`, { score, stats });
  }
  setPayment(id: string, playerId: string, paid: boolean) { return this.post<MatchWithPlayers>(`/matches/${id}/payments`, { playerId, paid }); }
  ratingTask(id: string) { return this.get<RatingTask>(`/matches/${id}/rating-task`); }
  submitRatings(id: string, ratings: { ratee: string; scores: Partial<Attributes>; playAgain: boolean }[], mvp: string | null) {
    return this.post<{ ok: boolean }>(`/matches/${id}/ratings`, { ratings, mvp });
  }
  closeRatings(id: string) { return this.post<MatchWithPlayers>(`/matches/${id}/finalize-ratings`); }

  // Organizer
  overview() { return this.get<OrganizerOverview>('/organizer/overview'); }
  updateSettings(body: Partial<GroupSettings>) { return this.put<GroupSettings>('/organizer/settings', body); }
  resetInvite() { return this.post<GroupSettings>('/organizer/invite/reset'); }
  setAdjustment(playerId: string, value: number, reason: AdjustmentReason | null) {
    return this.put<MemberView>(`/organizer/players/${playerId}/adjustment`, { value, reason });
  }
  removeMember(playerId: string) { return this.del<{ ok: boolean }>(`/organizer/players/${playerId}`); }
  resolveDispute(matchId: string, playerId: string, decision: 'accept' | 'reject') {
    return this.post<{ ok: boolean }>('/organizer/disputes', { matchId, playerId, decision });
  }
}

export type { Match };
