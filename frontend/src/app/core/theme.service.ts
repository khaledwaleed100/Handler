import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export type Theme = 'dark' | 'light';

/**
 * Light or dark.
 *  - First visit: follows the phone's own setting.
 *  - Once someone picks one, it's remembered on this device and on their account,
 *    so it follows them to other phones.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    // After sign-in, use the theme saved on the account (if they ever chose one).
    effect(() => {
      const saved = this.auth.user()?.preferences?.theme;
      if (saved && saved !== this.theme() && this.chosenHere() === null) this.theme.set(saved);
    });
    effect(() => {
      const t = this.theme();
      document.documentElement.classList.toggle('dark', t === 'dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0e2219' : '#f4fbf6');
    });
  }

  set(theme: Theme) {
    this.theme.set(theme);
    try { localStorage.setItem('theme', theme); } catch { /* private mode */ }
    if (this.auth.isLoggedIn()) {
      this.http.put(`${environment.apiUrl}/me`, { theme }).subscribe({ error: () => {} });
    }
  }

  toggle() {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  /** The choice made on this device, or null if they never picked. */
  private chosenHere(): Theme | null {
    try {
      const saved = localStorage.getItem('theme');
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch {
      return null;
    }
  }

  private initial(): Theme {
    return this.chosenHere() ?? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
}
