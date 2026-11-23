import { DestroyRef, Directive, ElementRef, NgZone, inject, input } from '@angular/core';

const SHOW_AT = 60; // px the circle must travel before letting go refreshes

/**
 * Pull down from the top of the screen to refresh, like native apps:
 * `<div class="page" [pullToRefresh]="reload">` where `reload` returns a promise.
 * Touch only; the circle spins until the promise settles.
 */
@Directive({ selector: '[pullToRefresh]' })
export class PullToRefreshDirective {
  action = input.required<() => Promise<unknown>>({ alias: 'pullToRefresh' });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const zone = inject(NgZone);
    const circle = document.createElement('div');
    circle.className = 'ptr';
    circle.setAttribute('aria-hidden', 'true');
    circle.innerHTML = '<span class="ptr-arrow">↓</span>';
    document.body.appendChild(circle);

    let startY: number | null = null;
    let distance = 0;
    let busy = false;

    const place = (d: number) => {
      circle.style.transform = `translate(-50%, ${d}px) rotate(${d * 3}deg)`;
      circle.style.opacity = String(Math.min(1, d / SHOW_AT));
    };
    const reset = () => {
      circle.classList.remove('dragging', 'ready', 'spinning');
      place(0);
      startY = null;
      distance = 0;
    };

    const onStart = (e: TouchEvent) => {
      // Only from the very top, one finger, and not while a sheet or dialog is open.
      if (busy || window.scrollY > 0 || e.touches.length !== 1 || document.querySelector('.sheet-backdrop')) return;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const pulled = e.touches[0].clientY - startY;
      if (pulled <= 0 || window.scrollY > 0) { if (distance) reset(); return; }
      distance = Math.min(100, pulled * 0.5);
      circle.classList.add('dragging');
      const ready = distance >= SHOW_AT;
      if (ready && !circle.classList.contains('ready')) { try { navigator.vibrate?.(8); } catch { /* no vibration */ } }
      circle.classList.toggle('ready', ready);
      place(distance);
    };
    const onEnd = () => {
      if (startY === null) return;
      if (distance < SHOW_AT) { reset(); return; }
      busy = true;
      circle.classList.remove('dragging', 'ready');
      circle.classList.add('spinning');
      circle.style.transform = `translate(-50%, ${SHOW_AT}px)`;
      zone.run(() => Promise.resolve().then(() => this.action()()))
        .catch(() => undefined)
        .finally(() => { busy = false; reset(); });
    };

    zone.runOutsideAngular(() => {
      host.addEventListener('touchstart', onStart, { passive: true });
      host.addEventListener('touchmove', onMove, { passive: true });
      host.addEventListener('touchend', onEnd);
      host.addEventListener('touchcancel', reset);
    });
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('touchstart', onStart);
      host.removeEventListener('touchmove', onMove);
      host.removeEventListener('touchend', onEnd);
      host.removeEventListener('touchcancel', reset);
      circle.remove();
    });
  }
}
