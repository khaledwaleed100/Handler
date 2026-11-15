import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, inject, output, signal, viewChild } from '@angular/core';
import { Api } from '../../core/api.service';
import { I18n } from '../../core/i18n/i18n.service';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; itp_support?: boolean }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
}

let scriptLoading: Promise<void> | null = null;
const loadScript = () => {
  scriptLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptLoading = null; reject(new Error('Google sign-in could not load')); };
    document.head.appendChild(s);
  });
  return scriptLoading;
};

/**
 * Google's official "Continue with Google" button.
 * Hidden entirely when the server has no GOOGLE_CLIENT_ID configured.
 * Emits Google's signed ID token; the server verifies it.
 */
@Component({
  selector: 'app-google-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (available()) {
      <div class="flex min-h-[44px] justify-center" #host></div>
      <div class="my-4 flex items-center gap-3 text-xs font-bold uppercase muted">
        <span class="divider flex-1"></span>{{ orLabel() }}<span class="divider flex-1"></span>
      </div>
    }`
})
export class GoogleButtonComponent implements AfterViewInit {
  private api = inject(Api);
  private i18n = inject(I18n);
  private zone = inject(NgZone);
  credential = output<string>();
  available = signal(true);
  orLabel = () => this.i18n.t('app.or');
  host = viewChild<ElementRef<HTMLElement>>('host');

  async ngAfterViewInit() {
    try {
      const { googleClientId } = await this.api.config();
      if (!googleClientId) { this.available.set(false); return; }
      await loadScript();
      const g = (window as unknown as { google: GoogleIdentity }).google;
      g.accounts.id.initialize({
        client_id: googleClientId,
        itp_support: true,
        callback: (r) => this.zone.run(() => this.credential.emit(r.credential))
      });
      const el = this.host()?.nativeElement;
      if (el) {
        g.accounts.id.renderButton(el, {
          type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with',
          width: Math.min(el.clientWidth || 320, 400), locale: this.i18n.lang()
        });
      }
    } catch {
      this.available.set(false);
    }
  }
}
