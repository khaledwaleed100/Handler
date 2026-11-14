import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

const isApi = (req: HttpRequest<unknown>) => req.url.startsWith(environment.apiUrl);
const isAuthCall = (req: HttpRequest<unknown>) => req.url.startsWith(`${environment.apiUrl}/auth/`);

/**
 * Adds the access token to API calls. If the token has expired (401), it gets a
 * new one with the refresh cookie and retries once, so people are never thrown
 * out of the app every 15 minutes.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApi(req)) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);

  const withToken = (r: HttpRequest<unknown>) => {
    const token = auth.token();
    return token && !isAuthCall(r) ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;
  };

  return next(withToken(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall(req)) return throwError(() => err);
      return from(auth.refresh()).pipe(
        switchMap(ok => {
          if (!ok) {
            router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
            return throwError(() => err);
          }
          return next(withToken(req));
        })
      );
    })
  );
};

/** Turns any HTTP error into a human message. */
export const errorMessage = (err: unknown, fallback = 'Something went wrong'): string => {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return navigator.onLine ? 'Can\'t reach the server. Try again in a moment.' : 'You are offline';
    const msg = (err.error as { message?: string } | null)?.message;
    if (typeof msg === 'string' && msg) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};
