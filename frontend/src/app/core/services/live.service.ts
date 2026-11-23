import { DestroyRef, Injectable, NgZone, effect, inject, signal, untracked } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth.service';

export interface LiveEvent {
  /** 'matches' | 'polls' | 'players' | 'group', or 'all' after reconnecting (anything may have changed). */
  topic: string;
  id?: string;
  /** Increasing number, so the same event is never handled twice. */
  n: number;
}

/**
 * Live updates: one open connection to /api/events while the app is on screen.
 * The server says "matches changed", "a poll changed"… and screens reload by themselves,
 * so nobody has to pull to refresh to see a reply, a result or a message.
 *
 * Uses fetch (not EventSource) so it can send the sign-in token in a header.
 * Paused while the app is in the background; on return it reconnects and every
 * screen refreshes once, to catch up on anything missed.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  readonly event = signal<LiveEvent | null>(null);
  private n = 0;
  private abort: AbortController | null = null;
  private retry?: ReturnType<typeof setTimeout>;
  private connectedOnce = false;

  constructor() {
    effect(() => {
      const signedIn = !!this.auth.token();
      untracked(() => (signedIn ? this.connect() : this.disconnect()));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.disconnect();
      else if (this.auth.token()) this.connect();
    });
  }

  /**
   * Calls `reload` (at most once every 300 ms) when one of `topics` changes.
   * Call from a screen's constructor or field initializer; stops when the screen closes.
   */
  on(topics: string[], reload: (e: LiveEvent) => void) {
    const since = this.n;
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      const e = this.event();
      if (!e || e.n <= since || (e.topic !== 'all' && !topics.includes(e.topic))) return;
      clearTimeout(timer);
      timer = setTimeout(() => untracked(() => reload(e)), 300);
    });
  }

  private emit(topic: string, id?: string) {
    this.zone.run(() => this.event.set({ topic, id, n: ++this.n }));
  }

  private disconnect() {
    clearTimeout(this.retry);
    this.abort?.abort();
    this.abort = null;
  }

  private connect() {
    if (this.abort || document.hidden) return;
    const abort = new AbortController();
    this.abort = abort;
    this.zone.runOutsideAngular(() => this.read(abort).finally(() => {
      if (this.abort !== abort) return; // replaced or stopped on purpose
      this.abort = null;
      if (this.auth.token() && !document.hidden) this.retry = setTimeout(() => this.connect(), 5000);
    }));
  }

  private async read(abort: AbortController) {
    try {
      const res = await fetch(`${environment.apiUrl}/events`, {
        headers: { Authorization: `Bearer ${this.auth.token()}`, Accept: 'text/event-stream' },
        signal: abort.signal,
        cache: 'no-store'
      });
      if (res.status === 401) { await this.auth.refresh(); return; }
      if (!res.ok || !res.body) return;
      // Back after a gap (app reopened, connection dropped): refresh every screen once.
      if (this.connectedOnce) this.emit('all');
      this.connectedOnce = true;

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
          if (!data) continue;
          try {
            const msg = JSON.parse(data) as { topic: string; id?: string };
            this.emit(msg.topic, msg.id);
          } catch { /* ignore a malformed line */ }
        }
      }
    } catch {
      /* network drop or aborted: connect() decides whether to retry */
    }
  }
}
