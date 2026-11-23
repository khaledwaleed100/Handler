import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api.service';
import { AuthService } from '../auth.service';

/** 'install': on iPhone/iPad in Safari, notifications only work after "Add to Home Screen". */
export type PushState = 'unsupported' | 'install' | 'blocked' | 'off' | 'on';

/** Remembers that this person switched notifications off, so they aren't turned back on by themselves. */
const OPTED_OUT = 'push:off';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Phone notifications: match reminders, messages, rating requests. */
@Injectable({ providedIn: 'root' })
export class PushService {
  private swPush = inject(SwPush);
  private api = inject(Api);
  private auth = inject(AuthService);
  readonly state = signal<PushState>('off');

  async refreshState() {
    if (isIos() && !isInstalled()) {
      this.state.set('install');
      return;
    }
    if (!this.swPush.isEnabled || !('Notification' in window) || !this.auth.pushKey()) {
      this.state.set('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      this.state.set('blocked');
      return;
    }
    const sub = await firstValueFrom(this.swPush.subscription);
    this.state.set(sub && Notification.permission === 'granted' ? 'on' : 'off');
  }

  /** Must be called straight from a tap: iPhone only shows the permission prompt then. */
  async enable() {
    if (!('Notification' in window)) return;
    // Ask first, before anything else is awaited, or Safari quietly refuses.
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      this.state.set(permission === 'denied' ? 'blocked' : 'off');
      return;
    }
    const key = this.auth.pushKey();
    if (!key || !this.swPush.isEnabled) return;
    const sub = await this.swPush.requestSubscription({ serverPublicKey: key });
    await this.api.addPush(sub.toJSON());
    try { localStorage.removeItem(OPTED_OUT); } catch { /* storage blocked */ }
    this.state.set('on');
  }

  async disable() {
    try { localStorage.setItem(OPTED_OUT, '1'); } catch { /* storage blocked */ }
    const sub = await firstValueFrom(this.swPush.subscription);
    if (sub) {
      await this.api.removePush(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    this.state.set('off');
  }

  /**
   * On every app start: if notifications were allowed, make sure this phone is still subscribed
   * and the server knows it. Phones (iPhones especially) sometimes drop the subscription, which
   * made notifications stop with no warning.
   */
  async sync() {
    try {
      if (localStorage.getItem(OPTED_OUT) || !this.swPush.isEnabled || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      if (!this.auth.pushKey()) await this.auth.reloadMe();
      const key = this.auth.pushKey();
      if (!key) return;
      const sub = (await firstValueFrom(this.swPush.subscription)) ?? (await this.swPush.requestSubscription({ serverPublicKey: key }));
      await this.api.addPush(sub.toJSON());
      this.state.set('on');
    } catch { /* try again next time the app opens */ }
  }
}
