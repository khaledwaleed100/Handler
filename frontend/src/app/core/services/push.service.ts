import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api.service';
import { AuthService } from '../auth.service';

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

/** Phone notifications: match reminders, "a spot opened up", rating requests. */
@Injectable({ providedIn: 'root' })
export class PushService {
  private swPush = inject(SwPush);
  private api = inject(Api);
  private auth = inject(AuthService);
  readonly state = signal<PushState>('off');

  constructor() {
    this.refreshState();
  }

  async refreshState() {
    if (!this.swPush.isEnabled || !('Notification' in window) || !this.auth.pushKey()) {
      this.state.set('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      this.state.set('blocked');
      return;
    }
    const sub = await firstValueFrom(this.swPush.subscription);
    this.state.set(sub ? 'on' : 'off');
  }

  async enable() {
    const key = this.auth.pushKey();
    if (!key || !this.swPush.isEnabled) return;
    const sub = await this.swPush.requestSubscription({ serverPublicKey: key });
    await this.api.addPush(sub.toJSON());
    this.state.set('on');
  }

  async disable() {
    const sub = await firstValueFrom(this.swPush.subscription);
    if (sub) {
      await this.api.removePush(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
    this.state.set('off');
  }
}
