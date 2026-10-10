import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { DiceRenderService } from '@axe/application/dice/dice-render.service';

/**
 * The sheet over the table the dice of a chat roll tumble on, when the room has them thrown there.
 *
 * It lies over the whole table outside its 3D transform, and the dice are drawn on it where their
 * tray lies on the table as it is seen, shadows and all, so they seem to roll on the board. They
 * are drawn over the pieces rather than among them.
 */
@Component({
  selector: 'table-dice-overlay',
  templateUrl: './table-dice-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none absolute inset-0' },
})
export class TableDiceOverlayComponent {
  private readonly renderer = inject(DiceRenderService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const handle = this.renderer.registerTable(canvas);
      handle.resize(canvas.clientWidth, canvas.clientHeight);
      const observer =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(([entry]) => handle.resize(entry.contentRect.width, entry.contentRect.height));
      observer?.observe(canvas);
      destroyRef.onDestroy(() => {
        observer?.disconnect();
        handle.release();
      });
    });
  }
}
