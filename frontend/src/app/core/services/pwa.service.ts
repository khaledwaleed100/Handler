import { Injectable, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** "Install app" support. On iPhone there is no prompt, so the Me screen shows instructions instead. */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private deferred: BeforeInstallPromptEvent | null = null;
  readonly installed = signal(window.matchMedia?.('(display-mode: standalone)').matches ?? false);
  readonly canPrompt = signal(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canPrompt.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.installed.set(true);
      this.canPrompt.set(false);
      this.deferred = null;
    });
  }

  async install(): Promise<boolean> {
    if (!this.deferred) return false;
    await this.deferred.prompt();
    const { outcome } = await this.deferred.userChoice;
    this.deferred = null;
    this.canPrompt.set(false);
    return outcome === 'accepted';
  }
}
