import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Attribute, Attributes, Position } from '../../core/models';
import { TPipe } from '../../core/i18n/i18n.service';

/** Sliders for the self-rating. Goalkeeping only shows for keepers. */
@Component({
  selector: 'app-self-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    @for (a of keys(); track a) {
      <label class="mb-4 block">
        <span class="mb-1 flex items-center justify-between text-sm font-semibold">
          {{ ('attr.' + a) | t }}
          <b class="num text-base">{{ value()[a] }}</b>
        </span>
        <input type="range" min="30" max="95" step="1" class="w-full accent-emerald-500"
               [value]="value()[a]" (input)="set(a, $event)" [attr.aria-label]="('attr.' + a) | t" />
      </label>
    }`
})
export class SelfRatingComponent {
  value = model.required<Attributes>();
  position = input<Position>('MID');
  keys = computed<Attribute[]>(() => {
    const base: Attribute[] = ['pace', 'attack', 'passing', 'defence', 'physical'];
    return this.position() === 'GK' ? ['goalkeeping', ...base] : base;
  });

  set(a: Attribute, e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    this.value.update(cur => ({ ...cur, [a]: v }));
  }
}
