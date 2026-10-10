import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { type DataElementFieldTypeValue } from '@axe/domain/data/data-element';
import { FIELD_TYPE_CATALOG } from '@axe/features/data-element/game-data-element/field-type-catalog';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The kinds of field as a grid of icons with their names, five to a line, each as large as a
 * fingertip. The kind a field already is stands out; a press picks another.
 */
@Component({
  selector: 'data-element-type-grid',
  templateUrl: './data-element-type-grid.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: { class: 'block' },
})
export class DataElementTypeGridComponent {
  /** The kind the field is now, or null where a kind is being chosen for a field yet to be made. */
  readonly selected = input<string | null>(null);
  /** The id of the heading that names the grid. */
  readonly labelledBy = input<string | null>(null);
  readonly picked = output<DataElementFieldTypeValue>();

  protected readonly types = FIELD_TYPE_CATALOG;
}
