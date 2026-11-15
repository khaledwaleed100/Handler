import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="avatar" [style.width.rem]="size()" [style.height.rem]="size()" [style.font-size.rem]="size() * 0.4" [style.background]="url() ? null : color()">
      @if (url()) {
        <img [src]="url()" [alt]="name()" loading="lazy" decoding="async" />
      } @else {
        {{ initials() }}
      }
    </div>`
})
export class AvatarComponent {
  url = input<string | null | undefined>(null);
  name = input('');
  size = input(2.75);
  /** Same person, same colour, every time. */
  color = computed(() => {
    let h = 0;
    for (const ch of this.name()) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `linear-gradient(135deg, hsl(${h} 70% 52%), hsl(${(h + 40) % 360} 70% 38%))`;
  });
  initials = computed(() =>
    this.name().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?');
}
