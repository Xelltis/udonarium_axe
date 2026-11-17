import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RangeArea } from '@axe/domain/tabletop/range';
import { SolidKind, solidKindsFor } from '@axe/domain/tabletop/solid/solid-kind';
import { SheetBasicsCardComponent } from '@axe/features/character/game-character-sheet/sheet-basics-card.component';
import { TranslocoModule } from '@jsverse/transloco';

/** How each kind a range can stand up as is offered on its sheet. */
const SOLID_ITEMS: Record<SolidKind, { kind: SolidKind; labelKey: string; icon: string }> = {
  '': { kind: '', labelKey: 'feature.inventory.sheet.solidFlat', icon: 'layers' },
  column: { kind: 'column', labelKey: 'feature.inventory.sheet.solidColumn', icon: 'view_in_ar' },
  sphere: { kind: 'sphere', labelKey: 'feature.inventory.sheet.solidSphere', icon: 'language' },
  cone: { kind: 'cone', labelKey: 'feature.inventory.sheet.solidCone', icon: 'change_history' },
  beam: { kind: 'beam', labelKey: 'feature.inventory.sheet.solidBeam', icon: 'trending_flat' },
};

/**
 * The form a range's sheet is made of: its shape, what it stands up as, its colours, how it fills
 * the cells it covers, and its basic information.
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

  /** The kinds a range of a shape can stand up as, in the order their buttons stand. */
  protected solidItems(type: string): readonly { kind: SolidKind; labelKey: string; icon: string }[] {
    return solidKindsFor(type).map((kind) => SOLID_ITEMS[kind]);
  }

  /**
   * Writes a number typed into a field, and nothing while the field is empty or holds something that
   * is not a number, so that clearing a field to type afresh does not set the range to nought.
   */
  protected setNumber(typed: unknown, write: (value: number) => void): void {
    if (typed === null || typed === '' || typed === undefined) return;
    const value = Number(typed);
    if (Number.isFinite(value)) write(value);
  }

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
