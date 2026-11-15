import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

/** Shared frame for sign-in screens: logo, title, language switch. */
@Component({
  selector: 'app-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5"
         style="padding-top: calc(env(safe-area-inset-top) + 1rem); padding-bottom: calc(env(safe-area-inset-bottom) + 1.5rem)">
      <div class="flex justify-end">
        <button class="btn btn-sm btn-ghost" (click)="i18n.set(i18n.lang() === 'ar' ? 'en' : 'ar')">
          {{ i18n.lang() === 'ar' ? 'English' : 'العربية' }}
        </button>
      </div>
      <div class="mb-8 mt-6 flex flex-col items-center text-center">
        <img src="assets/logo.png" alt="The Handler" width="72" height="72" class="mb-2 rotate-3 rounded-[1.4rem] shadow-lg" />
        <div class="mb-3 text-xs font-black uppercase tracking-[0.25em] muted">The Handler</div>
        <h1 class="page-title">{{ title() }}</h1>
        @if (subtitle()) { <p class="mt-2 text-sm muted">{{ subtitle() }}</p> }
      </div>
      <ng-content />
    </div>`
})
export class AuthShellComponent {
  i18n = inject(I18n);
  title = input('');
  subtitle = input('');
}
