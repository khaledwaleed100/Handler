import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { ActivatedRouteSnapshot } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/http';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

/** Bottom-bar tabs, left to right. */
const TABS = ['home', 'matches', 'squad', 'vote', 'me', 'organizer'];

/** ['matches', ':id', 'rate'] style path of a route, for comparing how deep two screens are. */
const routePath = (snap: ActivatedRouteSnapshot): string[] => {
  const parts: string[] = [];
  for (let s: ActivatedRouteSnapshot | null = snap; s; s = s.firstChild) parts.push(...s.url.map(u => u.path));
  return parts;
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions({
        skipInitialTransition: true,
        // Slide direction: deeper = forward, shallower = back, between tabs = cross-fade.
        onViewTransitionCreated: ({ transition, from, to }) => {
          const a = routePath(from);
          const b = routePath(to);
          const nav = b.length > a.length ? 'forward' : b.length < a.length ? 'back'
            : TABS.indexOf(b[0]) >= 0 && TABS.indexOf(a[0]) >= 0 && a[0] !== b[0] ? 'fade' : 'forward';
          document.documentElement.dataset['nav'] = nav;
          transition.finished.finally(() => delete document.documentElement.dataset['nav']);
        }
      }),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Restore the session from the refresh cookie before the first screen renders.
    provideAppInitializer(() => {
      inject(ThemeService);
      return inject(AuthService).restore();
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
