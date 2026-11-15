import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export type Theme = 'dark' | 'light';

/** Dark by default; follows the user's saved preference once signed in. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private auth = inject(AuthService);
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    effect(() => {
      const saved = this.auth.user()?.preferences?.theme;
      if (saved && saved !== this.theme()) this.theme.set(saved);
    });
    effect(() => {
      const t = this.theme();
      document.documentElement.classList.toggle('dark', t === 'dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0e2219' : '#f4fbf6');
      try { localStorage.setItem('theme', t); } catch { /* ignore */ }
    });
  }

  set(theme: Theme) {
    this.theme.set(theme);
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return 'dark';
  }
}
