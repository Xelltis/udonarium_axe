import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { portraitElementAt, portraitNameOf, setPortraitNameOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import {
  CutInPortraitFitDialogComponent,
  type CutInPortraitFitDialogOption,
} from '@axe/features/character/game-character-sheet/cut-in-portrait-fit-dialog.component';
import { ImportCharacterImgComponent } from '@axe/features/character/import-character-img/import-character-img.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/** The highest place in the chat a portrait can stand at. */
export const MAX_PORTRAIT_POSITION = 11;

/**
 * A character's portraits: the one its piece shows, the others it can switch to, their names, and
 * where the portrait stands in the chat.
 *
 * On a wide sheet it is the column beside the game data; on a phone the sheet opens it from the
 * portrait in its heading.
 */
@Component({
  selector: 'character-portrait-panel',
  templateUrl: './character-portrait-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe, TranslocoModule],
  host: { class: 'flex min-w-0 flex-col gap-1.5' },
})
export class CharacterPortraitPanelComponent {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly translateFn = inject(TRANSLATE_FN);
  protected readonly isCompact = inject(ViewportService).isCompact;

  readonly character = input.required<GameCharacter>();
  protected readonly maxPosition = MAX_PORTRAIT_POSITION;

  /** The character's portraits in order, each with its picture and its name. */
  readonly portraitImages = computed(() => {
    this.objectChange.fileVersion();
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    if (!char.imageDataElement) return [];
    return char.imageDataElement.children.map((child, index) => {
      const file = this.imageStorage.get(child.value as string) ?? ImageFile.Empty;
      return { index, imageFile: file, name: portraitNameOf(child) };
    });
  });

  /** Which portrait the piece shows on the table. */
  readonly komaImageIndex = computed(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    return this.readKomaIndex(char);
  });

  /** The name of the portrait the piece shows; empty for none. */
  readonly portraitName = computed(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    return portraitNameOf(portraitElementAt(char, this.readKomaIndex(char)));
  });

  /** Where the character's portrait stands in the chat. */
  readonly portraitPosIndex = computed(() => {
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    return char.portraitPosition ?? 0;
  });

  /** The picture of the portrait the piece shows, or an empty one. */
  readonly komaImageFile = computed(() => {
    this.objectChange.fileVersion();
    const char = this.character();
    this.objectChange.versionOf(char.identifier)();
    const images = char.imageDataElement?.children ?? [];
    if (images.length === 0) return ImageFile.Empty;
    const target = images[Math.min(this.komaImageIndex(), images.length - 1)];
    return this.imageStorage.get(target.value as string) ?? ImageFile.Empty;
  });

  /**
   * Chooses which of the character's portraits is its image on the table, from the portrait
   * thumbnails; the index is held within the portraits it has.
   */
  setKomaIndex(index: number): void {
    const char = this.character();
    if (!char.imageDataElement) return;
    char.addExtendData();
    const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
    if (!iconEl) return;
    const max = char.imageDataElement.children.length - 1;
    iconEl.currentValue = Math.max(0, Math.min(index, max));
    iconEl.value = max;
    char.update();
  }

  /** Names the portrait the piece currently shows, from the name field under the thumbnails. */
  setPortraitName(event: Event): void {
    const char = this.character();
    const element = portraitElementAt(char, this.readKomaIndex(char));
    if (!element) return;
    setPortraitNameOf(element, (event.target as HTMLInputElement).value);
    char.update();
  }

  /** Moves where the character's portrait stands in chat, from the arrows beside the position. */
  setPortraitPos(pos: number): void {
    this.character().portraitPosition = Math.max(0, Math.min(pos, MAX_PORTRAIT_POSITION));
  }

  /**
   * Opens the image picker and adds the chosen picture as another portrait of the character, from
   * the add button after the thumbnails.
   */
  addPortrait(): void {
    const char = this.character();
    if (!char.imageDataElement) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: false }).then((value) => {
      if (!value || !char.imageDataElement) return;
      char.imageDataElement.appendChild(DataElement.create('imageIdentifier', value, { type: 'image' }, ''));
      const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
      if (iconEl) iconEl.value = char.imageDataElement.children.length - 1;
      char.update();
    });
  }

  /** Opens the image picker and replaces the picture of a portrait, from a press on the large portrait. */
  changePortrait(index: number): void {
    const char = this.character();
    if (!char.imageDataElement) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: false }).then((value) => {
      if (!value || !char.imageDataElement) return;
      const images = char.imageDataElement.children;
      if (index < images.length) {
        images[index].value = value;
        char.update();
      }
    });
  }

  /**
   * Removes a portrait from the character, from the delete button under the thumbnails.
   *
   * The last portrait cannot be removed. When the one shown on the table is removed the first
   * portrait takes its place; otherwise the piece keeps showing the same picture.
   */
  removePortrait(index: number): void {
    const char = this.character();
    if (!char.imageDataElement) return;
    const images = char.imageDataElement.children;
    if (images.length <= 1) return;
    const el = images[index];
    if (!el) return;
    const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
    if (iconEl) {
      const komaIdx = iconEl.currentValue as number;
      if (komaIdx === index) iconEl.currentValue = 0;
      else if (komaIdx > index) iconEl.currentValue = komaIdx - 1;
      iconEl.value = images.length - 2;
    }
    char.imageDataElement.removeChild(el);
    char.update();
  }

  /**
   * Opens a small panel by the pointer for copying another character's pictures onto this one, from
   * the import button under the portraits.
   */
  showImportImages(): void {
    const char = this.character();
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x - 250,
      top: coordinate.y - 175,
      width: 350,
      height: 250,
      title: this.translateFn('feature.inventory.sheet.imageCopyTitle', { name: char.name }),
    };
    const component = this.panelService.open<ImportCharacterImgComponent>(ImportCharacterImgComponent, option);
    component.tabletopObject = char;
  }

  /**
   * Opens the dialog that sets how the character's portraits sit in a cut-in's portrait slot,
   * starting on the one the piece shows, from the button under the portraits.
   */
  openCutInFit(): void {
    const char = this.character();
    const option: CutInPortraitFitDialogOption = {
      characterIdentifier: char.identifier,
      pictureIdentifier: `${portraitElementAt(char, this.readKomaIndex(char))?.value ?? ''}`,
    };
    void this.modalService.open(CutInPortraitFitDialogComponent, option);
  }

  private readKomaIndex(char: GameCharacter): number {
    const iconEl = char.detailDataElement?.getFirstElementByName('ICON');
    return iconEl ? (iconEl.currentValue as number) : 0;
  }
}
