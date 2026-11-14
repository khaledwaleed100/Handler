import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from './core/auth.service';

const signedIn: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

const signedOut: CanActivateFn = () => (inject(AuthService).isLoggedIn() ? inject(Router).createUrlTree(['/home']) : true);

const organizer: CanActivateFn = () => (inject(AuthService).isOrganizer() ? true : inject(Router).createUrlTree(['/home']));

/** Screens load on demand, so the first load on a phone stays small. */
export const routes: Routes = [
  { path: 'login', canActivate: [signedOut], loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'join/:code', canActivate: [signedOut], loadComponent: () => import('./features/auth/join.page').then(m => m.JoinPage) },
  { path: 'forgot', canActivate: [signedOut], loadComponent: () => import('./features/auth/forgot.page').then(m => m.ForgotPage) },

  { path: 'home', canActivate: [signedIn], loadComponent: () => import('./features/home/home.page').then(m => m.HomePage) },
  { path: 'matches', canActivate: [signedIn], loadComponent: () => import('./features/matches/matches.page').then(m => m.MatchesPage) },
  { path: 'matches/:id', canActivate: [signedIn], loadComponent: () => import('./features/matches/match.page').then(m => m.MatchPage) },
  { path: 'matches/:id/rate', canActivate: [signedIn], loadComponent: () => import('./features/rate/rate.page').then(m => m.RatePage) },
  { path: 'squad', canActivate: [signedIn], loadComponent: () => import('./features/squad/squad.page').then(m => m.SquadPage) },
  { path: 'squad/:id', canActivate: [signedIn], loadComponent: () => import('./features/squad/player.page').then(m => m.PlayerPage) },
  { path: 'vote', canActivate: [signedIn], loadComponent: () => import('./features/polls/polls.component').then(m => m.PollsComponent) },
  { path: 'me', canActivate: [signedIn], loadComponent: () => import('./features/me/me.page').then(m => m.MePage) },
  { path: 'organizer', canActivate: [signedIn, organizer], loadComponent: () => import('./features/organizer/organizer.page').then(m => m.OrganizerPage) },

  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' }
];
