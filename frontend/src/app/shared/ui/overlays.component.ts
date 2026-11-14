import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Ui } from '../../core/ui.service';
import { TPipe } from '../../core/i18n/i18n.service';

/** Toasts and the confirm sheet, rendered once at the app root. */
@Component({
  selector: 'app-overlays',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TPipe],
  template: `
    <div class="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
         style="top: calc(env(safe-area-inset-top) + 0.75rem)" role="status" aria-live="polite">
      @for (t of ui.toasts(); track t.id) {
        <div class="toast" [class.error]="t.kind === 'error'">{{ t.text }}</div>
      }
    </div>

    @if (ui.confirmRequest(); as req) {
      <div class="sheet-backdrop" (click)="ui.answer(req.input ? '' : false)">
        <div class="sheet" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="sheet-handle"></div>
          <h2 class="text-lg font-black">{{ req.title }}</h2>
          @if (req.body) { <p class="mt-2 text-sm muted">{{ req.body }}</p> }
          @if (req.input) {
            <label class="field mt-4">
              <span>{{ req.input.label }}</span>
              <input class="input" [type]="req.input.type" [(ngModel)]="value" autofocus
                     [attr.autocomplete]="req.input.type === 'password' ? 'current-password' : 'off'" />
            </label>
          }
          <div class="mt-5 grid grid-cols-2 gap-2">
            <button class="btn btn-ghost" (click)="ui.answer(req.input ? '' : false); value.set('')">{{ 'app.cancel' | t }}</button>
            <button class="btn" [class.btn-danger]="req.danger" [class.btn-primary]="!req.danger"
                    [disabled]="!!req.input && !value()"
                    (click)="ui.answer(req.input ? value() : true); value.set('')">{{ req.confirm }}</button>
          </div>
        </div>
      </div>
    }`
})
export class OverlaysComponent {
  ui = inject(Ui);
  value = signal('');
}
