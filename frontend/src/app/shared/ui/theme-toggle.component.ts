import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '../../core/theme.service';
import { I18n } from '../../core/i18n/i18n.service';
import { IconComponent } from './icon.component';

/** Round sun / moon button that flips between light and dark. */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <button type="button" class="icon-btn" (click)="theme.toggle()"
            [attr.aria-label]="i18n.t('me.theme') + ': ' + i18n.t(theme.theme() === 'dark' ? 'me.light' : 'me.dark')">
      <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
    </button>`
})
export class ThemeToggleComponent {
  theme = inject(ThemeService);
  i18n = inject(I18n);
}
