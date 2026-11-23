import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Shows a number that counts up (or down) to its value instead of jumping:
 * `<span [countUp]="score"></span>`. Instant for people who turned animations off.
 */
@Directive({ selector: '[countUp]' })
export class CountUpDirective {
  value = input.required<number>({ alias: 'countUp' });
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private shown = 0;
  private frame = 0;

  constructor() {
    effect(() => {
      const to = Math.round(this.value() ?? 0);
      cancelAnimationFrame(this.frame);
      const from = this.shown;
      if (from === to || reducedMotion()) { this.show(to); return; }
      const start = performance.now();
      const duration = Math.min(900, 350 + Math.abs(to - from) * 20);
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        this.show(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))); // ease-out
        if (p < 1) this.frame = requestAnimationFrame(step);
      };
      this.frame = requestAnimationFrame(step);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private show(n: number) {
    this.shown = n;
    this.el.nativeElement.textContent = String(n);
  }
}
