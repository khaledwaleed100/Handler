import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth.service';
import { TPipe } from './core/i18n/i18n.service';
import { PollService } from './core/services/poll.service';
import { IconComponent } from './shared/ui/icon.component';
import { OverlaysComponent } from './shared/ui/overlays.component';

/**
 * App shell: the screen plus one navigation bar, which sits at the bottom on
 * phones (thumb reach) and at the top on wide screens.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe, IconComponent, OverlaysComponent],
  template: `
    @if (showNav()) {
      <nav class="tabbar md:!bottom-auto md:top-0 md:border-b md:border-t-0" aria-label="Main">
        <div class="mx-auto flex max-w-2xl items-stretch">
          @for (tab of tabs(); track tab.path) {
            <a class="tab" [routerLink]="tab.path" routerLinkActive="on" [attr.aria-label]="tab.label | t">
              <app-icon [name]="tab.icon" [size]="24" />
              <span>{{ tab.label | t }}</span>
              @if (tab.path === '/vote' && polls.pendingVotes() > 0) { <span class="dot"></span> }
            </a>
          }
        </div>
      </nav>
    }
    <main class="md:pt-[var(--tabbar-h)]">
      <router-outlet />
    </main>
    <app-overlays />
  `
})
export class AppComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  polls = inject(PollService);

  private url = toSignal(this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects)), { initialValue: '' });

  showNav = computed(() => this.auth.isLoggedIn() && !/^\/(login|join|forgot)|\/rate$/.test(this.url()));

  constructor() {
    // After a deploy, phones keep running the old version until reloaded.
    // When a new version is downloaded, switch to it on the next screen change,
    // so nobody loses what they were typing.
    const sw = inject(SwUpdate);
    if (sw.isEnabled) {
      let ready = false;
      sw.versionUpdates.pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY')).subscribe(() => (ready = true));
      this.router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(e => {
        if (ready) location.href = (e as NavigationStart).url;
      });
      setInterval(() => sw.checkForUpdate().catch(() => {}), 30 * 60 * 1000);
    }
  }

  tabs = computed(() => [
    { path: '/home', icon: 'home', label: 'nav.home' },
    { path: '/matches', icon: 'calendar', label: 'nav.matches' },
    { path: '/squad', icon: 'users', label: 'nav.squad' },
    { path: '/vote', icon: 'vote', label: 'nav.vote' },
    this.auth.isOrganizer()
      ? { path: '/organizer', icon: 'whistle', label: 'nav.organizer' }
      : { path: '/me', icon: 'user', label: 'nav.me' }
  ]);
}
