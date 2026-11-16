import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { SaveProgress } from '@axe/application/file/save-progress';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { copyMask } from '@axe/application/tabletop/copy-mask';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { hexChannels } from '@axe/core/util/hex-color';
import { wholeCells } from '@axe/core/util/whole-cells';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { MaskPictureFieldComponent } from '@axe/features/tabletop/game-table-mask-sheet/mask-picture-field.component';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { TranslocoModule } from '@jsverse/transloco';

/** What a colour picker can show for a stored colour: a six-digit hex, or the fallback for anything else. */
function colorPickerValue(color: string, fallback: string): string {
  const channels = hexChannels(color);
  if (!channels) return fallback;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

const MASK_FILL_FALLBACK = '#0a0a0a';
const SCRATCHED_COLOR_FALLBACK = '#808080';

@Component({
  selector: 'game-table-mask-sheet',
  templateUrl: './game-table-mask-sheet.component.html',
  host: { class: 'block box-border h-full overflow-y-auto p-3 text-ui-text bg-ui-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MaskPictureFieldComponent, TranslocoModule],
})
export class GameTableMaskSheetComponent {
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly _gameTableMask = signal<GameTableMask | null>(null);

  /** The mask this sheet edits, handed in by whoever opens the panel. */
  get gameTableMask(): GameTableMask | null {
    return this._gameTableMask();
  }
  set gameTableMask(value: GameTableMask | null) {
    this._gameTableMask.set(value);
  }

  /**
   * A number that moves whenever the mask or anything in its data changes, here or on another peer;
   * the template reads it so every field follows.
   */
  readonly maskVersion = computed(() => {
    const mask = this._gameTableMask();
    if (!mask) return 0;
    return this.objectChange.versionOf(mask.identifier)();
  });

  /** The mask's own picture, and whether one is set even while its file has not arrived. */
  readonly maskImage = computed(() => {
    this.objectChange.fileVersion();
    const mask = this._gameTableMask();
    if (!mask) return { isSet: false, url: '' };
    this.objectChange.versionOf(mask.identifier)();
    const identifier = mask.imageIdentifier;
    return { isSet: identifier.length > 0, url: this.imageService.getEmptyOr(identifier).url };
  });

  /** The picture shown after scratching, and whether one is set even while its file has not arrived. */
  readonly scratchedImage = computed(() => {
    this.objectChange.fileVersion();
    const mask = this._gameTableMask();
    if (!mask) return { isSet: false, url: '' };
    this.objectChange.versionOf(mask.identifier)();
    const identifier = mask.scratchedImageIdentifier;
    return { isSet: identifier.length > 0, url: this.imageService.getEmptyOr(identifier).url };
  });

  private readonly saveProgress = new SaveProgress();
  readonly isSaving = this.saveProgress.isSaving;
  readonly progressPercent = this.saveProgress.percent;

  constructor() {
    closeWhenOffTheTable();
    this.objectChange.objectDeleted$.subscribe((e) => {
      const mask = this._gameTableMask();
      if (mask && mask.identifier === e.identifier) this.panelService.close();
    }, this.destroyRef);
  }

  /** The mask's name; setting it writes the name data element, which syncs to every peer. */
  get name(): string {
    return this._gameTableMask()?.name ?? '';
  }
  set name(value: string) {
    const mask = this._gameTableMask();
    if (mask) mask.name = value;
  }

  /**
   * How many cells wide the mask is; writes are rounded down to whole cells and kept at one or more,
   * and an empty field is ignored.
   */
  get width(): number {
    return this._gameTableMask()?.width ?? 1;
  }
  set width(value: number) {
    const mask = this._gameTableMask();
    const cells = wholeCells(value);
    if (mask && cells !== null) mask.width = Math.max(1, cells);
  }

  /**
   * How many cells tall the mask is; writes are rounded down to whole cells and kept at one or more,
   * and an empty field is ignored.
   */
  get height(): number {
    return this._gameTableMask()?.height ?? 1;
  }
  set height(value: number) {
    const mask = this._gameTableMask();
    const cells = wholeCells(value);
    if (mask && cells !== null) mask.height = Math.max(1, cells);
  }

  /**
   * How opaque the mask is, from 0 to 100.
   *
   * Setting it writes that share of the mask's opacity, held to the range; an empty field is left
   * alone.
   */
  get opacity(): number {
    return this._gameTableMask()?.opacityPercent ?? 100;
  }
  set opacity(value: number) {
    const mask = this._gameTableMask();
    if (!mask || value === null || value === undefined || `${value}`.trim() === '') return;
    mask.opacityPercent = Number(value);
  }

  /** The colour the mask is filled with, as a colour picker shows it. */
  get maskColor(): string {
    const mask = this._gameTableMask();
    return colorPickerValue(mask?.bgcolor ?? '', MASK_FILL_FALLBACK);
  }

  /** Fills the mask with a colour, adding its colour element on a mask that has none yet. */
  setMaskColor(color: string) {
    this._gameTableMask()?.paintColor(color);
  }

  /** The words written across the mask, line breaks and all. */
  get maskText(): string {
    return this._gameTableMask()?.text ?? '';
  }
  set maskText(text: string) {
    const mask = this._gameTableMask();
    if (mask) mask.text = text ?? '';
  }

  /** The size of the words in pixels. */
  get textSize(): number {
    return this._gameTableMask()?.textSize ?? GameTableMask.DEFAULT_TEXT_SIZE;
  }

  /**
   * Takes the size typed into the field once it is settled, by Enter, by leaving the field or by its
   * arrows, rather than at every key, so a size can be typed a digit at a time before it is held to
   * its bounds. The field then shows the size the mask took; a field left empty changes nothing.
   */
  protected commitTextSize(field: HTMLInputElement): void {
    const mask = this._gameTableMask();
    if (mask && field.value.trim() !== '') mask.textSize = Number(field.value);
    field.value = `${this.textSize}`;
  }

  /** The colour of the words. */
  get textColor(): string {
    return this._gameTableMask()?.textColor ?? GameTableMask.DEFAULT_TEXT_COLOR;
  }

  /** Sets the colour of the words. */
  setTextColor(color: string) {
    const mask = this._gameTableMask();
    if (mask) mask.textColor = color;
  }

  /** Whether the words are drawn with a dark outline. */
  get textOutline(): boolean {
    return this._gameTableMask()?.textOutline ?? true;
  }
  set textOutline(outline: boolean) {
    const mask = this._gameTableMask();
    if (mask) mask.textOutline = !!outline;
  }

  /** The colour shown after scratching, or empty when there is none. */
  get scratchedColor(): string {
    return this._gameTableMask()?.scratchedColor ?? '';
  }

  /** The colour shown after scratching as a colour picker shows it, a mid grey while there is none. */
  get scratchedColorPicker(): string {
    return colorPickerValue(this.scratchedColor, SCRATCHED_COLOR_FALLBACK);
  }

  /** Sets the colour shown in cells that have been scratched open. */
  setScratchedColor(color: string) {
    const mask = this._gameTableMask();
    if (mask) mask.scratchedColor = color;
  }

  /** Takes the after-scratch colour away, so open cells show the picture or the table again. */
  clearScratchedColor() {
    const mask = this._gameTableMask();
    if (mask) mask.scratchedColor = '';
  }

  /**
   * Lets the user pick the mask's own picture; closing the picker without choosing leaves it as it
   * was.
   */
  openMaskImageModal() {
    const mask = this._gameTableMask();
    if (!mask) return;
    this.modalService.open<string>(FileSelecterComponent).then((value) => {
      if (value == null) return;
      mask.imageIdentifier = value;
    });
  }

  /** Takes the mask's own picture off, so it is filled with its colour again. */
  clearMaskImage() {
    const mask = this._gameTableMask();
    if (mask) mask.imageIdentifier = '';
  }

  /**
   * Lets the user pick the picture shown after scratching; closing the picker without choosing leaves
   * it as it was.
   */
  openScratchedImageModal() {
    const mask = this._gameTableMask();
    if (!mask) return;
    this.modalService.open<string>(FileSelecterComponent).then((value) => {
      if (value == null) return;
      mask.scratchedImageIdentifier = value;
    });
  }

  /** Takes the after-scratch picture away. */
  clearScratchedImage() {
    const mask = this._gameTableMask();
    if (mask) mask.scratchedImageIdentifier = '';
  }

  /**
   * Opens the mask in the generic data sheet, which lists every data element it holds, lets items be
   * added under its detail, and can move into a window of its own.
   */
  openDataSheet() {
    const mask = this._gameTableMask();
    if (!mask) return;
    const title = sheetPanelTitle(this.t('feature.tabletop.panel.mask'), mask.name);
    this.objectPanels.openSheet(mask, title, { width: 400, height: 300 });
  }

  /**
   * Places an unlocked copy of the mask one cell down and to the right of the original, and plays the
   * put-down sound.
   */
  clone() {
    const mask = this._gameTableMask();
    if (!mask) return;
    copyMask(mask, this.tabletopService.gridSize());
    SoundEffect.play(PresetSound.cardPut);
  }

  /**
   * Downloads the mask as a save file, showing progress until shortly after it finishes; does nothing
   * while a save is running.
   */
  async saveToXML() {
    const mask = this._gameTableMask();
    if (!mask) return;
    await this.saveProgress.run((onProgress) =>
      this.saveDataService.saveGameObjectAsync(mask, 'xml_' + mask.name, onProgress)
    );
  }
}
