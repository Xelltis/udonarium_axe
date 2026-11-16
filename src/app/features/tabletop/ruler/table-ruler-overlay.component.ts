import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RulerService } from '@axe/application/tabletop/ruler.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { pageOfTablePoint } from '@axe/domain/tabletop/camera/table-camera';
import { RulerReading } from '@axe/domain/tabletop/ruler/ruler-line';
import { TranslocoModule } from '@jsverse/transloco';

/** How far over the middle of a ruler its reading is said, in page pixels, clear of the line. */
const READING_RISE_PX = 10;

/** A ruler's reading where it is said on the screen over the table, and whose ruler it is. */
interface ReadingOnScreen {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly reading: RulerReading;
  readonly colour: string;
  /** Who laid it, for a ruler somebody else is laying; none for this seat's own. */
  readonly name: string | null;
}

/**
 * What the rulers on the table measure, said over the middle of each where the table's canvas draws
 * it: the straight length and the length in the room's unit, and under it the length over the table,
 * how far up the far end is and the steps it takes. Written with an outline round the letters and
 * nothing laid under them, so the table shows through.
 */
@Component({
  selector: 'table-ruler-overlay',
  templateUrl: './table-ruler-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class TableRulerOverlayComponent {
  private readonly ruler = inject(RulerService);
  private readonly camera = inject(TableCameraService);

  protected readonly readings = computed<readonly ReadingOnScreen[]>(() => {
    this.camera.version();
    const scene = this.camera.sceneMatrix();
    const layout = this.camera.layout;
    const own = this.ruler.measured();
    if (!scene || !layout || !own) return [];
    const middle = {
      x: (own.from.x + own.to.x) / 2,
      y: (own.from.y + own.to.y) / 2,
      z: (own.from.z + own.to.z) / 2,
    };
    const page = pageOfTablePoint(scene, middle.x, middle.y, middle.z);
    return [
      {
        id: 'own',
        left: page.x - layout.left,
        top: page.y - layout.top - READING_RISE_PX,
        reading: own.reading,
        colour: 'rgba(255, 236, 140, 1)',
        name: null,
      },
    ];
  });
}
