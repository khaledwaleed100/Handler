import { Injectable, inject, signal } from '@angular/core';
import { I18n } from './i18n/i18n.service';
import { errorMessage } from './http';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error' | 'info';
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirm: string;
  danger?: boolean;
  /** When set, the user must type something (e.g. their password) to confirm. */
  input?: { label: string; type: 'text' | 'password' };
  resolve: (value: string | boolean) => void;
}

/** Toasts, confirm sheets and small phone niceties (vibration, sharing). */
@Injectable({ providedIn: 'root' })
export class Ui {
  private i18n = inject(I18n);
  readonly toasts = signal<Toast[]>([]);
  readonly confirmRequest = signal<ConfirmRequest | null>(null);
  private nextId = 1;

  toast(text: string, kind: Toast['kind'] = 'ok', ms = 3200) {
    const id = this.nextId++;
    this.toasts.update(list => [...list.slice(-2), { id, text, kind }]);
    setTimeout(() => this.toasts.update(list => list.filter(t => t.id !== id)), ms);
  }

  error(err: unknown) {
    this.toast(errorMessage(err, this.i18n.t('app.error')), 'error', 4500);
  }

  /** Resolves true/false, or the typed text when `input` is given ('' when cancelled). */
  confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<string | boolean> {
    return new Promise(resolve => this.confirmRequest.set({ ...opts, resolve }));
  }

  answer(value: string | boolean) {
    this.confirmRequest()?.resolve(value);
    this.confirmRequest.set(null);
  }

  /** A short tick on phones that support it. */
  haptic(pattern: number | number[] = 10) {
    try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast(this.i18n.t('app.copied'));
    } catch {
      this.toast(text, 'info', 8000);
    }
  }

  /** Native share sheet when available, WhatsApp otherwise. */
  async share(text: string, files?: File[]) {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (files?.length && nav.canShare?.({ files })) {
        await nav.share({ text, files });
        return;
      }
      if (nav.share) {
        await nav.share({ text });
        return;
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
}
