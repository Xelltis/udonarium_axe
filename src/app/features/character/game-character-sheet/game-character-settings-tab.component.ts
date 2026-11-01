import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  clampPieceImageHeight,
  clampPieceImageWidth,
  heightInProportion,
  PIECE_IMAGE_HEIGHT_MAX_PX,
  PIECE_IMAGE_HEIGHT_MIN_PX,
  PIECE_IMAGE_WIDTH_MAX_PX,
  PIECE_IMAGE_WIDTH_MIN_PX,
  pieceImageWidthApart,
  widthInProportion,
} from '@axe/domain/character/piece-image-size';
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
import { normalizeFolderPath } from '@axe/domain/folder/folder-path';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import {
  readSeatHeight,
  seatHeightFieldOf,
  seatHeightFromField,
  SeatHeightUnit,
  writeSeatHeight,
} from '@axe/domain/tabletop/ride/ride-rules';
import { clampInRange, floatOr, roundOr } from '@axe/features/character/game-character-sheet/numeric-input-helpers';
import { GameDataElementComponent } from '@axe/features/data-element/game-data-element/game-data-element.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  selector: 'game-character-settings-tab',
  templateUrl: './game-character-settings-tab.component.html',
  host: { class: 'block', '[attr.inert]': "isReadOnly() ? '' : null" },
  imports: [FormsModule, GameDataElementComponent, SafePipe, TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCharacterSettingsTabComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly ride = inject(RideService);

  readonly isReadOnly = computed(() => !this.rolePermission.canEditTabletop());

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

  private readonly chosenSeatUnit = signal<SeatHeightUnit | null>(null);

  /**
   * How high a mount's riders stand, as its fields show it: the number, null for the default, and
   * the unit it is typed in, pixels for a piece given a picture height until another is chosen.
   * Null where the piece is no mount.
   */
  readonly seatHeightField = computed<{ readonly value: number | null; readonly unit: SeatHeightUnit } | null>(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    if (char.mountable !== '1') return null;
    const field = seatHeightFieldOf(readSeatHeight(char.mountSeatHeight));
    if (field) return field;
    return { value: null, unit: this.chosenSeatUnit() ?? (char.specifyKomaImageFlag ? 'px' : 'cells') };
  });

  /**
   * Sets how high the mount's riders stand from the number field, in the unit chosen. An empty field
   * goes back to the default, and a number below 0 changes nothing and is put back as it was.
   */
  onSetSeatHeight(event: Event): void {
    const field = this.seatHeightField();
    if (!field) return;
    const input = event.target as HTMLInputElement;
    if (input.value.trim() === '') {
      this.ride.setSeatHeight(this.character(), '');
      return;
    }
    const setting = seatHeightFromField(input.valueAsNumber, field.unit);
    if (setting) this.ride.setSeatHeight(this.character(), writeSeatHeight(setting));
    else input.value = field.value === null ? '' : `${field.value}`;
  }

  /** Changes the unit the mount's seat height is typed in, rewriting a height already set so its riders stay where they are. */
  setSeatHeightUnit(unit: SeatHeightUnit): void {
    this.chosenSeatUnit.set(unit);
    const char = this.character();
    if (readSeatHeight(char.mountSeatHeight)) this.ride.convertSeatHeight(char, unit);
  }

  protected readonly komaHeightMin = PIECE_IMAGE_HEIGHT_MIN_PX;
  protected readonly komaHeightMax = PIECE_IMAGE_HEIGHT_MAX_PX;
  protected readonly komaWidthMin = PIECE_IMAGE_WIDTH_MIN_PX;
  protected readonly komaWidthMax = PIECE_IMAGE_WIDTH_MAX_PX;

  /** The piece's picture, as the address the hidden image below the size fields reads it from. */
  readonly komaImageUrl = computed(() => {
    this.objectChange.fileVersion();
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    return char.imageFile?.url ?? '';
  });

  private readonly loadedAspect = signal<{ readonly url: string; readonly aspect: number } | null>(null);

  /** The picture's width over its height, once the image has loaded; null until then. */
  private readonly komaImageAspect = computed(() => {
    const loaded = this.loadedAspect();
    return loaded && loaded.url === this.komaImageUrl() ? loaded.aspect : null;
  });

  /**
   * The picture's size as the fields show it: its height, its width, and whether the width keeps the
   * picture's own proportions. A width kept in proportion is worked out from the height, and is null
   * until the picture has loaded.
   */
  readonly komaSize = computed(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    const height = Number(char.komaImageHeight);
    const apart = pieceImageWidthApart(char.komaImageWidth);
    return {
      height,
      width: apart ?? widthInProportion(height, this.komaImageAspect()),
      linked: apart === null,
    };
  });

  /** Learns the picture's proportions from the hidden image once it has loaded. */
  onKomaImageLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) return;
    this.loadedAspect.set({ url: this.komaImageUrl(), aspect: image.naturalWidth / image.naturalHeight });
  }

  /** Turns the fixed piece image size on or off, from the settings tab's checkbox. */
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
    character.komaImageHeight = clampPieceImageHeight(Number(height), character.komaImageHeight);
    this.objectChange.notifyChanged(character.identifier);
    this.pointerDeviceService.isDragging = false;
  }

  /** Applies the piece image height as the slider or number field changes. */
  onChkKomaSize(event: Event): void {
    this.chkKomaSize((event.target as HTMLInputElement).valueAsNumber);
  }

  /**
   * Applies the piece image width as the slider or number field changes. While the width keeps the
   * picture's proportions, the height follows it, held within its own bounds; otherwise the width is
   * set alone, clamped to 10 to 2000 pixels. A value that is not a number changes nothing.
   */
  onChkKomaWidth(event: Event): void {
    const width = (event.target as HTMLInputElement).valueAsNumber;
    const character = this.character();
    if (this.komaSize().linked) {
      character.komaImageHeight = heightInProportion(width, this.komaImageAspect(), character.komaImageHeight);
    } else {
      character.komaImageWidth = clampPieceImageWidth(width, character.komaImageWidth);
    }
    this.objectChange.notifyChanged(character.identifier);
    this.pointerDeviceService.isDragging = false;
  }

  /**
   * Links or unlinks the picture's width to its height. Unlinked, the width starts from where the
   * picture's proportions put it, or as wide as the picture is tall before it has loaded; linked
   * again, the picture goes back to its own proportions at the height it has.
   */
  toggleKomaAspectLink(): void {
    const character = this.character();
    const size = this.komaSize();
    const start = size.width ?? size.height;
    character.komaImageWidth = size.linked ? clampPieceImageWidth(start, start) : 0;
    this.objectChange.notifyChanged(character.identifier);
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
    if (!this.rolePermission.canEditTabletop()) return;
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
