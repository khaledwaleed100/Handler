import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../core/i18n/i18n.service';

/**
 * Loading placeholders shaped like what's coming (a match card, a list of players…),
 * so the screen doesn't jump when the real content arrives.
 */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', class: 'block', '[attr.aria-label]': 'label()' },
  template: `
    @switch (kind()) {
      <!-- The next-match card: coloured header, progress bar, three reply buttons -->
      @case ('match') {
        <div class="card overflow-hidden">
          <div class="skeleton !rounded-none h-28"></div>
          <div class="p-4">
            <div class="mb-2 flex justify-between"><div class="skeleton h-4 w-20"></div><div class="skeleton h-4 w-24"></div></div>
            <div class="skeleton mb-4 h-2 !rounded-full"></div>
            <div class="grid grid-cols-3 gap-2">
              @for (i of [1, 2, 3]; track i) { <div class="skeleton h-12 !rounded-2xl"></div> }
            </div>
          </div>
        </div>
      }
      <!-- Match list: date block on the side, two lines of text -->
      @case ('cards') {
        <div class="flex flex-col gap-3">
          @for (i of rows(); track i) {
            <div class="card card-pad flex items-center gap-4 rise" [style.animation-delay.ms]="i * 60">
              <div class="skeleton h-16 w-14 shrink-0 !rounded-xl"></div>
              <div class="flex-1"><div class="skeleton mb-2 h-4 w-2/3"></div><div class="skeleton mb-2 h-3 w-1/4"></div><div class="skeleton h-5 w-16 !rounded-full"></div></div>
            </div>
          }
        </div>
      }
      <!-- People: round photo, name, one line under it -->
      @case ('rows') {
        <div class="card px-4">
          @for (i of rows(); track i) {
            <div class="flex items-center gap-3 py-3 rise" [class.divider]="i > 0" [style.animation-delay.ms]="i * 50">
              <div class="skeleton h-11 w-11 shrink-0 !rounded-full"></div>
              <div class="flex-1"><div class="skeleton mb-2 h-4" [style.width.%]="55 + ((i * 17) % 30)"></div><div class="skeleton h-3 w-1/3"></div></div>
              <div class="skeleton h-8 w-10 !rounded-lg"></div>
            </div>
          }
        </div>
      }
      <!-- A player's card: big header, a grid of numbers -->
      @case ('profile') {
        <div class="card overflow-hidden">
          <div class="skeleton !rounded-none h-44"></div>
          <div class="grid grid-cols-3 gap-2 p-4">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="skeleton h-14 !rounded-xl"></div> }
          </div>
        </div>
      }
    }`
})
export class SkeletonComponent {
  kind = input<'match' | 'cards' | 'rows' | 'profile'>('rows');
  count = input(4);
  rows = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  private i18n = inject(I18n);
  label = computed(() => this.i18n.t('app.loading'));
}
