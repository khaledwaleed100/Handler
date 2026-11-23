import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api.service';
import { TPipe } from '../../core/i18n/i18n.service';
import { POSITIONS, Position, PublicPlayer } from '../../core/models';
import { Ui } from '../../core/ui.service';
import { PlayerCardComponent } from '../../shared/ui/player-card.component';
import { SavedNoteComponent } from '../../shared/ui/saved-note.component';
import { LiveService } from '../../core/services/live.service';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { PullToRefreshDirective } from '../../shared/ui/pull-to-refresh.directive';

@Component({
  selector: 'app-squad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TPipe, PlayerCardComponent, SavedNoteComponent, SkeletonComponent, PullToRefreshDirective],
  template: `
    <div class="page" [pullToRefresh]="reload">
      <h1 class="page-title mb-4">{{ 'squad.title' | t }} <span class="muted text-lg">{{ players().length || '' }}</span></h1>

      <app-saved-note [at]="savedAt()" />
      <input class="input mb-3" type="search" [placeholder]="'squad.search' | t" [ngModel]="query()" (ngModelChange)="query.set($event)" />

      <div class="seg mb-2">
        <button [class.on]="pos() === null" (click)="pos.set(null)">{{ 'squad.all' | t }}</button>
        @for (p of positions; track p) {
          <button [class.on]="pos() === p" (click)="pos.set(p)">{{ ('pos.short_' + p) | t }}</button>
        }
      </div>
      <div class="mb-4 flex gap-1.5">
        @for (s of sorts; track s.key) {
          <button class="chip" [class.chip-primary]="sort() === s.key" (click)="sort.set(s.key)">{{ s.label | t }}</button>
        }
      </div>

      @if (loading() && !players().length) {
        <app-skeleton kind="rows" [count]="6" />
      } @else {
        <div class="card px-4">
          @for (p of shown(); track p._id) {
            <a [routerLink]="['/squad', p._id]" class="block" [class.divider]="!$first">
              <app-player-card [player]="p" />
            </a>
          } @empty {
            <p class="py-6 text-center muted">{{ 'squad.empty' | t }}</p>
          }
        </div>
      }
    </div>`
})
export class SquadPage implements OnInit {
  private api = inject(Api);
  private ui = inject(Ui);
  readonly positions = POSITIONS;
  readonly sorts = [
    { key: 'overall' as const, label: 'squad.sortOverall' },
    { key: 'goals' as const, label: 'squad.sortGoals' },
    { key: 'name' as const, label: 'squad.sortName' }
  ];

  players = signal<PublicPlayer[]>([]);
  loading = signal(true);
  savedAt = signal<number | null>(null);
  query = signal('');
  pos = signal<Position | null>(null);
  sort = signal<'overall' | 'goals' | 'name'>('overall');

  shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.players().filter(p => (!this.pos() || p.position === this.pos()) && (!q || p.name.toLowerCase().includes(q)));
    const by = this.sort();
    return [...list].sort((a, b) =>
      by === 'name' ? a.name.localeCompare(b.name) : by === 'goals' ? b.stats.goals - a.stats.goals || b.overall - a.overall : b.overall - a.overall);
  });

  readonly reload = () => this.load();

  constructor() {
    inject(LiveService).on(['players', 'matches', 'group'], () => this.load());
  }

  ngOnInit() {
    this.load();
  }

  async load() {
    const saved = this.api.cached.players();
    if (this.api.showNow(saved)) this.players.set(saved.data);
    try {
      this.players.set(await this.api.players());
    } catch (err) {
      if (saved) { this.players.set(saved.data); this.savedAt.set(saved.at); } else this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
