import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ResourceSliderService } from '@axe/application/character/resource-slider.service';
import { triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { Config } from '@axe/domain/peer/config';
import { asTableFacingMark, TABLE_FACING_MARKS, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What the room shows everyone: how a piece shows which way it faces, whether its picture keeps to
 * its cell seen from above or faces the reader in 3D, and whether number resources carry sliders.
 * Only the master changes any of it.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-shared-view-settings',
  templateUrl: './room-shared-view-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, TranslocoModule],
})
export class RoomSharedViewSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly resourceSliders = inject(ResourceSliderService);

  readonly isSharedReadOnly = this.access.isSharedReadOnly;

  readonly facingMarks = TABLE_FACING_MARKS;

  /** How a piece shows which way it faces, as the rules in force have it; setting it writes the room's own answer. */
  readonly facingMark = this.access.field<TableFacingMark>(
    () => asTableFacingMark(this.access.rules().facingMark),
    (value) => {
      if (this.access.mayWrite('shared')) Config.instance.facingMark = asTableFacingMark(value);
    }
  );

  /**
   * Whether a tall piece picture is held inside its cell while the table is seen from above, as the
   * rules in force have it; setting it writes the room's own answer.
   */
  readonly pieceImageInCell = this.access.ruleField('pieceImageInCell', (inCell) => inCell, 'shared');

  /** Whether a piece keeps its face to the reader, which is the table's own decision. */
  readonly imageBillboard = this.access.field(
    () => this.access.viewTable()?.imageBillboard ?? false,
    (value) => {
      const table = this.access.viewTable();
      if (!this.access.mayWrite('shared') || !table) return;
      table.imageBillboard = value;
      triggerUpdateGameObject(table.toContext());
    }
  );

  /** Whether a number resource that says nothing of its own slider shows one, for the whole room. */
  readonly resourceSliderByDefault = this.access.field(
    () => this.resourceSliders.roomDefault(),
    (shown) => {
      if (this.access.mayWrite('shared')) this.resourceSliders.setRoomDefault(shown);
    }
  );
}
