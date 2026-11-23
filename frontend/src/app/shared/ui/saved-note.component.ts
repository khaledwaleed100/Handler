import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, TPipe } from '../../core/i18n/i18n.service';

/** "Offline · showing what you saw 5 min ago", when a screen couldn't refresh its saved copy. */
@Component({
  selector: 'app-saved-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    @if (at(); as t) {
      <p class="chip chip-warn mb-3 !whitespace-normal" role="status">📴 {{ ago() ? ('app.savedCopy' | t: { t: ago() }) : ('app.savedCopyRecent' | t) }}</p>
    }`
})
export class SavedNoteComponent {
  private i18n = inject(I18n);
  /** When the copy on screen was fetched; null hides the note. */
  at = input<number | null>(null);
  /** '' when it's under a minute old. */
  ago = computed(() => {
    const ms = Date.now() - (this.at() ?? Date.now());
    return ms < 60_000 ? '' : this.i18n.duration(ms);
  });
}
