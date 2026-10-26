import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { WIDGET_RENDER_STATS } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { PERF_TERRAIN_GRID_RASTER, PERF_VISION_MEMO_MISS, PERF_VISION_SCENE } from '@axe/core/util/perf-counters';
import { RenderStatsService } from '@axe/features/widgets/render-stats/render-stats.service';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-render-stats',
  templateUrl: './render-stats.component.html',
  imports: [DecimalPipe, DraggableDirective, WidgetPlaceDirective],
})
export class RenderStatsComponent {
  protected readonly widgets = inject(WidgetVisibilityService);
  private readonly renderStats = inject(RenderStatsService);
  protected readonly widgetName = WIDGET_RENDER_STATS;
  protected readonly fallback = () => ({ left: 8, top: 96 });

  protected readonly stats = this.renderStats.stats;

  protected readonly perTerrain = computed(() => this.stats().elementsPerTerrain.toFixed(1));
  protected readonly sceneBuilds = computed(() => this.counterOf(PERF_VISION_SCENE));
  protected readonly memoMisses = computed(() => this.counterOf(PERF_VISION_MEMO_MISS));
  protected readonly gridRasters = computed(() => this.counterOf(PERF_TERRAIN_GRID_RASTER));

  private static readonly named = new Set<string>([PERF_VISION_SCENE, PERF_VISION_MEMO_MISS, PERF_TERRAIN_GRID_RASTER]);

  protected readonly totalCounters = computed(() =>
    [...this.renderStats.totals()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  );

  protected readonly otherCounters = computed(() =>
    [...this.stats().counters]
      .filter(([key]) => !RenderStatsComponent.named.has(key))
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count }))
  );

  constructor() {
    effect(() => {
      if (this.widgets.renderStats()) {
        this.renderStats.start();
      } else {
        this.renderStats.stop();
      }
    });
  }

  protected millis(value: number): string {
    return value.toFixed(1);
  }

  protected reset(): void {
    this.renderStats.reset();
  }

  protected close(): void {
    this.widgets.renderStats.set(false);
  }

  private counterOf(key: string): number {
    return this.stats().counters.get(key) ?? 0;
  }
}
