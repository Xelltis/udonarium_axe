import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PLACED_RULER_COLOUR, PlacedRulerService } from '@axe/application/tabletop/placed-ruler.service';
import { OTHER_RULER_COLOUR, OWN_RULER_COLOUR, RulerService } from '@axe/application/tabletop/ruler.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { pageOfTablePoint } from '@axe/domain/tabletop/camera/table-camera';
import { RulerReading } from '@axe/domain/tabletop/ruler/ruler-line';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';
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
 * What the rulers on the table measure, this seat's own, those the other seats are laying and those
 * left lying on the table, said
 * over the middle of each where the table's canvas draws it, with the name of whoever lays another's:
 * the straight length and the length in the room's unit, and under it the length over the table, how
 * far up the far end is and the steps it takes. Written with an outline round the letters and nothing
 * laid under them, so the table shows through.
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
  private readonly placedRulers = inject(PlacedRulerService);
  private readonly camera = inject(TableCameraService);

  protected readonly readings = computed<readonly ReadingOnScreen[]>(() => {
    this.camera.version();
    const scene = this.camera.sceneMatrix();
    const layout = this.camera.layout;
    if (!scene || !layout) return [];
    const at = (ruler: { readonly from: Vec3; readonly to: Vec3 }) => {
      const page = pageOfTablePoint(
        scene,
        (ruler.from.x + ruler.to.x) / 2,
        (ruler.from.y + ruler.to.y) / 2,
        (ruler.from.z + ruler.to.z) / 2
      );
      return { left: page.x - layout.left, top: page.y - layout.top - READING_RISE_PX };
    };
    const own = this.ruler.measured();
    const readings: ReadingOnScreen[] = this.ruler.others().map((other) => ({
      id: other.id,
      ...at(other),
      reading: other.reading,
      colour: OTHER_RULER_COLOUR,
      name: other.name,
    }));
    for (const placed of this.placedRulers.placed()) {
      readings.push({
        id: placed.ruler.identifier,
        ...at(placed),
        reading: placed.reading,
        colour: PLACED_RULER_COLOUR,
        name: null,
      });
    }
    if (own) readings.push({ id: 'own', ...at(own), reading: own.reading, colour: OWN_RULER_COLOUR, name: null });
    return readings;
  });
}
