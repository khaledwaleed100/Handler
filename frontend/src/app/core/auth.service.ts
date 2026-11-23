import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { GoogleSignInResult, Me, SelfPlayer, User } from './models';
import { I18n } from './i18n/i18n.service';
import { CacheService } from './cache.service';
import { PollService } from './services/poll.service';

interface SessionResponse extends Me {
  accessToken: string;
}

/** Who was signed in on this phone last time (profile only, never a token). */
const LAST_SESSION = 'session:v1';

/**
 * Login session.
 *
 * The access token lives only in memory (never in localStorage, where any injected
 * script could read it). The long-lived refresh token is an httpOnly cookie the
 * browser sends to /api/auth/refresh, so a reload or reopening the app restores
 * the session silently.
 *
 * Opening the app doesn't wait for the server: if someone was signed in last time,
 * their saved profile and screens show at once while the session is confirmed in the
 * background (a free server can take up to a minute to wake). Only a clear "signed out"
 * answer from the server sends them to the login page; no connection keeps them in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private i18n = inject(I18n);
  private cache = inject(CacheService);
  private polls = inject(PollService);
  private api = `${environment.apiUrl}/auth`;

  readonly token = signal<string | null>(null);
  readonly user = signal<User | null>(null);
  readonly player = signal<SelfPlayer | null>(null);
  readonly pushKey = signal<string | null>(null);
  /** Showing last time's account while the server confirms the session. */
  readonly provisional = signal(false);

  readonly isLoggedIn = computed(() => !!this.token() || this.provisional());
  readonly isOrganizer = computed(() => this.user()?.role === 'organizer');

  private refreshing: Promise<boolean> | null = null;

  /** Called once at startup. */
  async restore(): Promise<void> {
    const last = readLastSession();
    if (last) {
      this.cache.useAccount(last.user._id);
      this.applyMe(last);
      this.provisional.set(true);
      this.refresh(); // in the background: the first screen opens on saved data
      return;
    }
    await this.refresh();
  }

  /** The refresh in progress, if any. API calls wait for it instead of failing with an old token. */
  pending(): Promise<boolean> | null {
    return this.refreshing;
  }

  /** Swaps the refresh cookie for a new access token. Concurrent callers share one request. */
  refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = firstValueFrom(this.http.post<SessionResponse>(`${this.api}/refresh`, {}, { withCredentials: true }))
        .then(res => { this.setSession(res); return true; })
        .catch((err: unknown) => {
          const ended = err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403);
          // Offline or the server is still waking up: keep the saved session and try again later.
          if (!ended && this.provisional()) return false;
          const wasShowingApp = this.provisional();
          this.clear();
          if (wasShowingApp) this.toLogin();
          return false;
        })
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
    try {
      localStorage.setItem(LAST_SESSION, JSON.stringify({ user: me.user, player: me.player }));
    } catch { /* storage blocked: the app just opens a little slower */ }
  }

  /** Sends someone whose session ended to the login page, coming back here afterwards. */
  toLogin() {
    const here = this.router.url;
    if (/^\/(login|join|forgot)/.test(here)) return; // already there (don't nest returnUrl)
    this.router.navigate(['/login'], { queryParams: { returnUrl: here } });
  }

  /** Signs out on this phone: forgets the token, the profile and every saved screen. */
  clear() {
    this.token.set(null);
    this.user.set(null);
    this.player.set(null);
    this.provisional.set(false);
    this.cache.clear();
    this.polls.reset();
    try { localStorage.removeItem(LAST_SESSION); } catch { /* nothing saved */ }
  }

  private setSession(res: SessionResponse) {
    const { accessToken, ...me } = res;
    this.cache.useAccount(me.user._id);
    this.token.set(accessToken);
    this.provisional.set(false);
    this.applyMe(me);
  }
}

const readLastSession = (): Me | null => {
  try {
    const me = JSON.parse(localStorage.getItem(LAST_SESSION) || 'null') as Me | null;
    return me?.user?._id ? me : null;
  } catch {
    return null;
  }
};
