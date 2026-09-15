import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

const LONG_HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SHORT_HEX_COLOR = /^#[0-9a-f]{3}$/i;

/** What a colour picker can show for a stored colour: a six-digit hex, or the fallback for anything else. */
function colorPickerValue(color: string, fallback: string): string {
  if (LONG_HEX_COLOR.test(color)) return color.toLowerCase();
  if (SHORT_HEX_COLOR.test(color)) {
    return `#${[...color.slice(1)].map((digit) => digit + digit).join('')}`.toLowerCase();
  }
  return fallback;
}

/** A typed number as a count of whole cells, at least one; null for a field left empty or not a number. */
function wholeCells(value: unknown): number | null {
  if (value === null || value === undefined || `${value}`.trim() === '') return null;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(1, number) : null;
}

const MASK_FILL_FALLBACK = '#0a0a0a';
const SCRATCHED_COLOR_FALLBACK = '#808080';

@Component({
  selector: 'game-table-mask-sheet',
  templateUrl: './game-table-mask-sheet.component.html',
  host: { class: 'block box-border h-full overflow-y-auto p-3 text-ui-text bg-ui-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SafePipe, TranslocoModule],
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
    const element = mask.imageDataElement?.getFirstElementByName('imageIdentifier');
    const identifier = element ? `${element.value}`.trim() : '';
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

  readonly isSaving = signal(false);
  readonly progressPercent = signal(0);

  constructor() {
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
    if (mask && cells !== null) mask.width = cells;
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
    if (mask && cells !== null) mask.height = cells;
  }

  /**
   * How opaque the mask is, from 0 to 100.
   *
   * Setting it writes the current value of the opacity element as that share of the element's
   * maximum, clamped to the range; an empty field, or a mask without an opacity element, is left
   * alone.
   */
  get opacity(): number {
    const mask = this._gameTableMask();
    return mask ? Math.round(mask.opacity * 100) : 100;
  }
  set opacity(value: number) {
    const mask = this._gameTableMask();
    if (!mask || value === null || value === undefined || `${value}`.trim() === '') return;
    const percent = Number(value);
    if (!Number.isFinite(percent)) return;
    const element = mask.commonDataElement?.getFirstElementByName('opacity');
    if (!element) return;
    const maximum = Number(element.value);
    const full = Number.isFinite(maximum) && maximum > 0 ? maximum : 100;
    element.currentValue = Math.round((Math.min(100, Math.max(0, percent)) / 100) * full);
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
      const element = mask.imageDataElement?.getFirstElementByName('imageIdentifier');
      if (element) element.value = value;
    });
  }

  /** Takes the mask's own picture off, so it is filled with its colour again. */
  clearMaskImage() {
    const element = this._gameTableMask()?.imageDataElement?.getFirstElementByName('imageIdentifier');
    if (element) element.value = '';
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
    const gridSize = this.tabletopService.gridSize();
    const cloneObject = mask.clone();
    cloneObject.location.x += gridSize;
    cloneObject.location.y += gridSize;
    cloneObject.isLock = false;
    if (mask.parent) mask.parent.appendChild(cloneObject);
    cloneObject.update();
    SoundEffect.play(PresetSound.cardPut);
  }

  /**
   * Downloads the mask as a save file, showing progress until shortly after it finishes; does nothing
   * while a save is running.
   */
  async saveToXML() {
    const mask = this._gameTableMask();
    if (!mask || this.isSaving()) return;
    this.isSaving.set(true);
    this.progressPercent.set(0);
    await this.saveDataService.saveGameObjectAsync(mask, 'xml_' + mask.name, (percent) => {
      this.progressPercent.set(percent);
    });
    setTimeout(() => {
      this.isSaving.set(false);
      this.progressPercent.set(0);
    }, 500);
  }
}
