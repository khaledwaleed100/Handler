import { Injectable, Pipe, PipeTransform, computed, inject, signal } from '@angular/core';
import { en } from './en';
import { ar } from './ar';

export type Lang = 'en' | 'ar';
const DICTS = { en, ar } as const;
const STORAGE_KEY = 'lang';

/**
 * Tiny translation service: English and Arabic, switchable at runtime.
 * Switching to Arabic also flips the whole layout right-to-left.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.initialLang());
  readonly dir = computed(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));
  readonly locale = computed(() => (this.lang() === 'ar' ? 'ar-EG' : 'en-GB'));

  constructor() {
    this.apply(this.lang());
  }

  set(lang: Lang) {
    this.lang.set(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    this.apply(lang);
  }

  /** t('home.hello', { name: 'Ali' }) */
  t(key: string, params?: Record<string, string | number>): string {
    let value: unknown = DICTS[this.lang()];
    for (const part of key.split('.')) value = (value as Record<string, unknown> | undefined)?.[part];
    if (typeof value !== 'string') {
      // Fall back to English, then to the key itself, so a missing string never breaks a screen.
      value = key.split('.').reduce<unknown>((v, p) => (v as Record<string, unknown> | undefined)?.[p], en);
      if (typeof value !== 'string') return key;
    }
    return params ? (value as string).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')) : (value as string);
  }

  date(value: string | Date, opts: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale(), opts).format(new Date(value));
  }

  number(value: number): string {
    return new Intl.NumberFormat(this.locale()).format(value);
  }

  money(amount: number, currency: string): string {
    return `${this.number(amount)} ${currency}`;
  }

  /** "2h", "3d" style durations. */
  duration(ms: number): string {
    const min = Math.round(Math.abs(ms) / 60000);
    if (min < 1) return this.t('time.now');
    if (min < 60) return this.t('time.min', { n: min });
    const h = Math.round(min / 60);
    if (h < 48) return this.t('time.hour', { n: h });
    return this.t('time.day', { n: Math.round(h / 24) });
  }

  private initialLang(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return navigator.language?.startsWith('ar') ? 'ar' : 'en';
  }

  private apply(lang: Lang) {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}

/** {{ 'home.hello' | t: { name: user.name } }} — impure so it updates when the language changes. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private i18n = inject(I18n);
  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}
