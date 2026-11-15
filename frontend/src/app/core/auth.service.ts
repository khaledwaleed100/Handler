import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { GoogleSignInResult, Me, SelfPlayer, User } from './models';
import { I18n } from './i18n/i18n.service';

interface SessionResponse extends Me {
  accessToken: string;
}

/**
 * Login session.
 *
 * The access token lives only in memory (never in localStorage, where any injected
 * script could read it). The long-lived refresh token is an httpOnly cookie the
 * browser sends to /api/auth/refresh, so a reload or reopening the app restores
 * the session silently.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private i18n = inject(I18n);
  private api = `${environment.apiUrl}/auth`;

  readonly token = signal<string | null>(null);
  readonly user = signal<User | null>(null);
  readonly player = signal<SelfPlayer | null>(null);
  readonly pushKey = signal<string | null>(null);

  readonly isLoggedIn = computed(() => !!this.token());
  readonly isOrganizer = computed(() => this.user()?.role === 'organizer');

  private refreshing: Promise<boolean> | null = null;

  /** Called once at startup. */
  async restore(): Promise<void> {
    await this.refresh();
  }

  /** Swaps the refresh cookie for a new access token. Concurrent callers share one request. */
  refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = firstValueFrom(this.http.post<SessionResponse>(`${this.api}/refresh`, {}, { withCredentials: true }))
        .then(res => { this.setSession(res); return true; })
        .catch(() => { this.clear(); return false; })
        .finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  async login(email: string, password: string) {
    const res = await firstValueFrom(this.http.post<SessionResponse>(`${this.api}/login`, { email, password }, { withCredentials: true }));
    this.setSession(res);
  }

  async register(body: Record<string, unknown>) {
    const res = await firstValueFrom(this.http.post<SessionResponse>(`${this.api}/register`, body, { withCredentials: true }));
    this.setSession(res);
  }

  /**
   * Google sign-in. Returns null when signed in; otherwise the details needed to
   * finish sign-up (kept here until the profile steps are done).
   */
  readonly googleSignup = signal<GoogleSignInResult | null>(null);

  async google(credential: string, inviteCode?: string): Promise<GoogleSignInResult | null> {
    const res = await firstValueFrom(this.http.post<SessionResponse & GoogleSignInResult>(
      `${this.api}/google`, { credential, inviteCode }, { withCredentials: true }));
    if (res.needsProfile) {
      this.googleSignup.set(res);
      return res;
    }
    this.setSession(res);
    return null;
  }

  async googleComplete(body: Record<string, unknown>) {
    const signup = this.googleSignup();
    const res = await firstValueFrom(this.http.post<SessionResponse>(
      `${this.api}/google/complete`, { ...body, signupToken: signup?.signupToken }, { withCredentials: true }));
    this.googleSignup.set(null);
    this.setSession(res);
  }

  checkInvite(code: string) {
    return firstValueFrom(this.http.get<{ valid: boolean; groupName: string }>(`${this.api}/invite/${encodeURIComponent(code)}`));
  }

  forgot(email: string) {
    return firstValueFrom(this.http.post<{ ok: boolean }>(`${this.api}/forgot`, { email }));
  }

  reset(email: string, code: string, newPassword: string) {
    return firstValueFrom(this.http.post<{ ok: boolean }>(`${this.api}/reset`, { email, code, newPassword }));
  }

  async logout() {
    try {
      await firstValueFrom(this.http.post(`${this.api}/logout`, {}, { withCredentials: true }));
    } catch { /* signing out locally is what matters */ }
    this.clear();
    await this.router.navigate(['/login']);
  }

  /** Re-reads the profile (after edits, ratings closing, etc.). */
  async reloadMe() {
    const me = await firstValueFrom(this.http.get<Me>(`${environment.apiUrl}/me`));
    this.applyMe(me);
  }

  applyMe(me: Me) {
    this.user.set(me.user);
    this.player.set(me.player);
    if (me.pushKey !== undefined) this.pushKey.set(me.pushKey ?? null);
    if (me.user?.preferences?.lang && me.user.preferences.lang !== this.i18n.lang()) {
      this.i18n.set(me.user.preferences.lang);
    }
  }

  clear() {
    this.token.set(null);
    this.user.set(null);
    this.player.set(null);
  }

  private setSession(res: SessionResponse) {
    this.token.set(res.accessToken);
    this.applyMe(res);
  }
}
