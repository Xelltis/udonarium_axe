import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { RangeArea } from '@axe/domain/tabletop/range';
import {
  initialRangeClip,
  paintRange,
  RangeClip,
  rangeClipPathCss,
  rangeQuadrantCells,
} from '@axe/features/tabletop/range/range-paint';

/**
 * A range area as the table paints it, laid out in table pixels around its origin, for the
 * first-person view to lay on the floor at whatever scale it draws the room.
 */
@Component({
  selector: 'first-person-range',
  templateUrl: './first-person-range.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstPersonRangeComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);

  readonly range = input.required<RangeArea>();
  readonly gridSize = input.required<number>();
  readonly gridType = input.required<number>();

  private readonly gridCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('gridCanvas');
  private readonly rangeCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('rangeCanvas');

  private readonly version = computed(() => this.objectChange.versionOf(this.range().identifier)());

  private readonly clip = signal<RangeClip | null>(null);

  /** How far out from the origin the canvases reach, in table pixels. */
  protected readonly reachPx = computed(() => {
    this.version();
    return rangeQuadrantCells(this.range()) * this.gridSize();
  });

  protected readonly opacity = computed(() => {
    this.version();
    return this.range().opacity;
  });

  protected readonly clipPath = computed(() => {
    this.version();
    const range = this.range();
    return rangeClipPathCss(this.clip() ?? initialRangeClip(range.type), range, this.gridSize());
  });

  constructor() {
    effect(() => {
      this.version();
      const range = this.range();
      const gridSize = this.gridSize();
      const gridType = this.gridType();
      const grid = this.gridCanvas().nativeElement;
      const outline = this.rangeCanvas().nativeElement;
      untracked(() => {
        if (gridSize <= 0 || !grid.getContext('2d')) return;
        const docked = this.objectStore.get(range.followingCharacterIdentifier) !== null;
        this.clip.set(paintRange(grid, outline, range, { gridSize, gridType, docked }));
      });
    });
  }
}
