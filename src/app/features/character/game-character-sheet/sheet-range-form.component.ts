import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RangeArea } from '@axe/domain/tabletop/range';
import { SheetBasicsCardComponent } from '@axe/features/character/game-character-sheet/sheet-basics-card.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The form a range's sheet is made of: its shape, its colours, how it fills the cells it covers,
 * and its basic information.
 *
 * Every field writes straight to the range. The form stands where the sheet puts it, as the
 * component itself takes up no box.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'sheet-range-form',
  templateUrl: './sheet-range-form.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, SheetBasicsCardComponent, TranslocoModule],
})
export class SheetRangeFormComponent {
  private readonly objectChange = inject(ObjectChangeService);

  /** The range the form edits. */
  readonly range = input.required<RangeArea>();

  /** The shapes on offer, in the order their buttons stand. */
  protected readonly rangeTypeItems: readonly { type: string; labelKey: string; icon: string }[] = [
    { type: 'LINE', labelKey: 'feature.inventory.sheet.rangeShapeLine', icon: 'remove' },
    { type: 'CORN', labelKey: 'feature.inventory.sheet.rangeShapeCorn', icon: 'change_history' },
    { type: 'TRIANGLE', labelKey: 'feature.inventory.sheet.rangeShapeTriangle', icon: 'details' },
    { type: 'SQUARE', labelKey: 'feature.inventory.sheet.rangeShapeSquare', icon: 'crop_square' },
    { type: 'RHOMBUS', labelKey: 'feature.inventory.sheet.rangeShapeDiamond', icon: 'diamond' },
    { type: 'PENTAGON', labelKey: 'feature.inventory.sheet.rangeShapePentagon', icon: 'pentagon' },
    { type: 'HEXAGON', labelKey: 'feature.inventory.sheet.rangeShapeHexagon', icon: 'hexagon' },
    { type: 'CIRCLE', labelKey: 'feature.inventory.sheet.rangeShapeCircle', icon: 'radio_button_unchecked' },
  ];

  /** The range as it stands now, so the form is drawn again when the range changes, here or in the room. */
  protected current(): RangeArea {
    const range = this.range();
    this.objectChange.versionOf(range.identifier)();
    return range;
  }

  /** Sets the range's border colour from its colour field. */
  protected onChangeRangeColor(event: Event): void {
    this.range().rangeColor = (event.target as HTMLInputElement).value;
  }

  /** Sets the range's fill colour from its colour field. */
  protected onChangeGridColor(event: Event): void {
    this.range().gridColor = (event.target as HTMLInputElement).value;
  }
}
