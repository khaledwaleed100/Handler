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
        <div class="mb-4 flex h-16 w-16 rotate-3 items-center justify-center rounded-2xl text-3xl shadow-lg"
             style="background: linear-gradient(135deg, #10b981, #047857)">⚽</div>
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
