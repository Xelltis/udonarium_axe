import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RulerService } from '@axe/application/tabletop/ruler.service';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The band at the foot of the screen while the ruler is in hand: how to lay it before it is laid, and
 * what it measures once it is, with buttons to lift and lower its far end for a hand with no wheel,
 * and to put it away.
 */
@Component({
  selector: 'ruler-band',
  templateUrl: './ruler-band.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class RulerBandComponent {
  protected readonly ruler = inject(RulerService);
  protected readonly zIndex = Z_TABLE_BANDS;
}
