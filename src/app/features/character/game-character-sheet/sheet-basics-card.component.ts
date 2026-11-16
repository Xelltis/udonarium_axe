import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DataElement } from '@axe/domain/data/data-element';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The card of an object's basic information on its sheet: a heading over the fields every object of
 * its kind has, with their names locked.
 *
 * The card stands where the sheet puts it, as the component itself takes up no box.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'sheet-basics-card',
  templateUrl: './sheet-basics-card.component.html',
  host: { class: 'contents' },
  imports: [GameDataElementComponent, TranslocoModule],
})
export class SheetBasicsCardComponent {
  /** The element that holds the object's basic fields. */
  readonly element = input.required<DataElement>();
  /** The classes that place the card in the layout it stands in, such as its width or its span. */
  readonly place = input('');
}
