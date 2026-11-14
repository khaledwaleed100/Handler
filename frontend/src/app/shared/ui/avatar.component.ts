import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="avatar" [style.width.rem]="size()" [style.height.rem]="size()" [style.font-size.rem]="size() * 0.4">
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
  initials = computed(() =>
    this.name().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?');
}
