import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { normalizeFolderPath } from '@axe/domain/character/character-folder';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  convertLegacyCheckTableElements,
  countConvertibleCheckTableElements,
} from '@axe/domain/data/check-table-converter';
import type { DataElement } from '@axe/domain/data/data-element';
import {
  appendElementTemplateToSheet,
  findElementTemplateHolder,
  readElementTemplates,
} from '@axe/domain/data/data-element-templates';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { clampInRange, floatOr, roundOr } from '@axe/features/character/game-character-sheet/numeric-input-helpers';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'game-character-settings-tab',
  templateUrl: './game-character-settings-tab.component.html',
  host: { class: 'block', '[attr.inert]': "isReadOnly() ? '' : null" },
  imports: [FormsModule, GameDataElementComponent, TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCharacterSettingsTabComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly rolePermission = inject(RolePermissionService);

  readonly isReadOnly = computed(() => {
    this.objectChange.trackMyCursor();
    return !this.rolePermission.canEditTabletop;
  });

  readonly character = input.required<GameCharacter>();

  readonly locationChange = output<string>();

  readonly myPeerId = getMyPeerId();

  readonly characterPieceSignals = computed(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    return {
      roll: char.roll,
      rotate: char.rotate,
      locationX: char.location.x,
      locationY: char.location.y,
    };
  });

  readonly legacyCheckTableCount = computed(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    if (!char.detailDataElement) return 0;
    return countConvertibleCheckTableElements(char.detailDataElement);
  });

  /** Turns the fixed piece image height on or off, from the settings tab's checkbox. */
  setSpecifyKomaImageFlag(value: boolean): void {
    const character = this.character();
    character.specifyKomaImageFlag = value;
    this.objectChange.notifyChanged(character.identifier);
  }

  /**
   * Sets the height the piece's image is drawn at, clamped to 50 to 750 pixels.
   *
   * A value that is not a number keeps the current height. The change is announced to this client's
   * views, and the pointer's dragging flag is cleared.
   */
  chkKomaSize(height: number): void {
    const character = this.character();
    character.komaImageHeight = clampInRange(Number(height), 50, 750, character.komaImageHeight);
    this.objectChange.notifyChanged(character.identifier);
    this.pointerDeviceService.isDragging = false;
  }

  /** Applies the piece image height as the slider or number field changes. */
  onChkKomaSize(event: Event): void {
    this.chkKomaSize((event.target as HTMLInputElement).valueAsNumber);
  }

  /**
   * Sets the piece's altitude on the table from the number field, rounded to a whole value; an
   * empty field reads as zero.
   */
  onChkAltitude(event: Event): void {
    const character = this.character();
    character.altitude = roundOr((event.target as HTMLInputElement).valueAsNumber, 0);
  }

  /** Sets the piece's rotation from the number field; an empty field reads as zero. */
  onChkRotate(event: Event): void {
    const character = this.character();
    character.rotate = floatOr((event.target as HTMLInputElement).valueAsNumber, 0);
  }

  /** Turns the piece back to no rotation, from the reset button next to the rotation field. */
  resetRotate(): void {
    const character = this.character();
    character.rotate = 0;
    SoundEffect.play(PresetSound.sweep);
  }

  /**
   * Sets the piece's roll, its tilt out of the table plane, from the number field; an empty field
   * reads as zero.
   */
  onChkRoll(event: Event): void {
    const character = this.character();
    character.roll = floatOr((event.target as HTMLInputElement).valueAsNumber, 0);
  }

  /** Stands the piece back up with no roll, from the reset button next to the roll field. */
  resetRoll(): void {
    const character = this.character();
    character.roll = 0;
    SoundEffect.play(PresetSound.sweep);
  }

  /**
   * Sets the width of the piece's hover popup from the number field, clamped to 270 to 800 pixels;
   * anything not a number keeps the current width.
   */
  onChkPopWidth(event: Event): void {
    const character = this.character();
    character.overViewWidth = clampInRange(
      (event.target as HTMLInputElement).valueAsNumber,
      270,
      800,
      character.overViewWidth
    );
  }

  /**
   * Sets the maximum height of the piece's hover popup from the number field, clamped to 250 to
   * 1000 pixels; anything not a number keeps the current height.
   */
  onChkPopMaxHeight(event: Event): void {
    const character = this.character();
    character.overViewMaxHeight = clampInRange(
      (event.target as HTMLInputElement).valueAsNumber,
      250,
      1000,
      character.overViewMaxHeight
    );
  }

  /**
   * Passes the inventory chosen in the location menu (table, shared, personal or graveyard) up to
   * the sheet, which moves the piece there.
   */
  onSetLocation(event: Event): void {
    this.locationChange.emit((event.target as HTMLSelectElement).value);
  }

  /**
   * Files the character under the folder path typed into the folder field.
   *
   * The path is normalised and written back into the field. Users who may not edit the table change
   * nothing, and an unchanged path is not written.
   */
  onSetFolder(event: Event): void {
    if (!this.rolePermission.canEditTabletop) return;
    const character = this.character();
    const input = event.target as HTMLInputElement;
    const folderName = normalizeFolderPath(input.value);
    input.value = folderName;
    if (character.folderName === folderName) return;
    // The synchronised setter announces the change on its way through; saying so again here made
    // every listener do its work twice.
    character.folderName = folderName;
  }

  /**
   * Converts the sheet's old-style check tables to the current format, from the data migration
   * button, and tells the room when any were converted.
   */
  convertLegacyCheckTables(): void {
    const char = this.character();
    if (!char.detailDataElement) return;
    const convertedCount = convertLegacyCheckTableElements(char.detailDataElement);
    if (convertedCount < 1) return;
    this.objectChange.notifyChanged(char.detailDataElement.identifier);
    char.update();
  }

  readonly elementTemplates = computed<DataElement[]>(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    const holder = findElementTemplateHolder(char);
    if (holder) this.objectChange.versionOf(holder.identifier)();
    return readElementTemplates(char);
  });

  /**
   * Adds a copy of one of the character's element templates to its sheet, from the template's add
   * button.
   *
   * Does nothing when the character has no sheet or the template finds no place in it.
   */
  addTemplateToSheet(template: DataElement): void {
    const char = this.character();
    if (!char.detailDataElement) return;
    const placed = appendElementTemplateToSheet(char.detailDataElement, template);
    if (!placed) return;
    placed.element.update();
    this.objectChange.notifyChanged(placed.parent.identifier);
    char.update();
  }
}
