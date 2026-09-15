import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { DataElement } from '@axe/domain/data/data-element';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { buildTextNoteContextMenuModel } from '@axe/features/tabletop/text-note/text-note-context-menu';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_TABLETOP_OBJECT_PX } from '@axe/ui/tabletop/z-offset';
import { decorateChatStyleText } from '@axe/ui/text-decoration/decorate-chat-text';

@Component({
  selector: 'text-note',
  templateUrl: './text-note.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, RotableDirective, SelectableDirective, NgStyle, FormsModule, LinkifyPipe, SafePipe],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(mousedown)': 'onMouseDown($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class TextNoteComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosureService = inject(DisclosureService);

  readonly canView = computed(() => {
    const note = this.textNote();
    if (!note) return false;
    this.objectChange.versionOf(note.identifier)();
    this.objectChange.trackMyCursor();
    return this.disclosureService.canView(note);
  });
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  protected readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);

  readonly isHiddenByFog = computed(() => {
    const piece = this.textNote();
    if (!piece) return false;
    this.objectChange.versionOf(piece.identifier)();
    return this.visionService.isPieceHiddenByFog(piece, 1);
  });

  constructor() {
    effect(() => {
      const req = this.uiSignalService.noteResizeRequest();
      if (!req || !this.textNote()) return;
      if (this.textNote().identifier === req.identifier) {
        this.calcFitHeight();
      }
    });
    setupMovableRotableForPiece(this, {
      target: this.textNote,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_TABLETOP_OBJECT_PX),
    });
    this.destroyRef.onDestroy(() => {
      if (this._transitionTimeout) clearTimeout(this._transitionTimeout);
      if (this._fallTimeout) clearTimeout(this._fallTimeout);
      if (this.textUpdateTimer) clearTimeout(this.textUpdateTimer);
    });
    effect(() => {
      const note = this.textNote();
      this.objectChange.versionOf(note.identifier)();
      const trackChildren = (elms: readonly DataElement[]) => {
        for (const elm of elms) {
          this.objectChange.versionOf(elm.identifier)();
          if (elm.children.length) trackChildren(elm.children as DataElement[]);
        }
      };
      if (note.commonDataElement) trackChildren(note.commonDataElement.children as DataElement[]);
      this._text.set(note.text);
      this._fontSize.set(note.fontSize);
      this.calcFitHeightIfNeeded();
    });
  }

  readonly textAreaElementRef = viewChild<ElementRef<HTMLTextAreaElement>>('textArea');

  readonly textNote = input.required<TextNote>();
  readonly is3D = input(false);

  readonly isEditing = signal(false);
  readonly decoratedHtml = computed(() => {
    const note = this.textNote();
    this.objectChange.versionOf(note.identifier)();
    return decorateChatStyleText(this._text());
  });
  readonly maskedHtml = computed(() => {
    const note = this.textNote();
    this.objectChange.versionOf(note.identifier)();
    return this._text().replace(/\S/g, '█');
  });
  readonly maskedTitle = computed(() => this.title().replace(/\S/g, '█'));

  /**
   * Switches the note into editing and puts the caret at the end of its text.
   *
   * Does nothing for a user who cannot edit the tabletop, on a locked note, or when the note is
   * already being edited.
   */
  enterEdit() {
    if (!this.rolePermission.canEditTabletop) return;
    if (this.textNote().isLock) return;
    if (this.isEditing()) return;
    this.isEditing.set(true);
    setTimeout(() => {
      const el = this.textAreaElementRef()?.nativeElement;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      this.calcFitHeight();
    });
  }

  /** Leaves editing when the text area loses focus. */
  onTextAreaBlur() {
    this.isEditing.set(false);
  }

  readonly title = computed(() => {
    const note = this.textNote();
    this.objectChange.versionOf(note.identifier)();
    if (note.commonDataElement) {
      for (const elm of note.commonDataElement.children as DataElement[]) {
        this.objectChange.versionOf(elm.identifier)();
      }
    }
    return note.title;
  });

  /** Follows every change to the note and its elements; the template reads it to get past OnPush. */
  readonly textNoteVersion = computed(() => {
    const note = this.textNote();
    let v = this.objectChange.versionOf(note.identifier)();
    if (note.commonDataElement) {
      for (const elm of note.commonDataElement.children as DataElement[]) {
        v += this.objectChange.versionOf(elm.identifier)();
      }
    }
    return v;
  });

  /**
   * Whether the note is locked, which keeps it from being moved or edited; setting it writes
   * straight to the note.
   */
  get isLock(): boolean {
    return this.textNote().isLock;
  }
  set isLock(isLock: boolean) {
    this.textNote().isLock = isLock;
  }

  private readonly _text = signal('');
  private readonly _fontSize = signal(9);
  private textUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The note's text as held by the text area.
   *
   * Setting it shows the change at once and writes it to the note after 66 ms without another
   * change, then refits the text area's height.
   */
  get text(): string {
    return this._text();
  }
  set text(text: string) {
    this._text.set(text);
    this.setTextUpdateTimer();
  }
  /** The note's font size setting; the text is drawn at this many pixels plus 9. */
  get fontSize(): number {
    return this._fontSize();
  }

  private setTextUpdateTimer() {
    if (this.textUpdateTimer) clearTimeout(this.textUpdateTimer);
    this.textUpdateTimer = setTimeout(() => {
      const note = this.textNote();
      if (note.text !== this._text()) note.text = this._text();
      this.textUpdateTimer = null;
      this.calcFitHeightIfNeeded();
    }, 66);
  }

  readonly imageFile = computed(() => {
    this.objectChange.fileVersion();
    const textNote = this.textNote();
    this.objectChange.versionOf(textNote.identifier)();
    return textNote.imageFile;
  });
  /** The note's rotation in degrees; setting it writes straight to the note. */
  get rotate(): number {
    return this.textNote().rotate;
  }
  set rotate(rotate: number) {
    this.textNote().rotate = rotate;
  }
  /** The note's height in cells, never negative. */
  get height(): number {
    return Math.max(0, this.textNote().height);
  }
  /** The note's width in cells, never negative. */
  get width(): number {
    return Math.max(0, this.textNote().width);
  }

  /** How high the note floats above the table, in cells; setting it writes straight to the note. */
  get altitude(): number {
    return this.textNote().altitude;
  }
  set altitude(altitude: number) {
    this.textNote().altitude = altitude;
  }

  /**
   * The altitude shown on the altitude label, rounded to one decimal place.
   *
   * A standing note sunk under the table is measured from its top edge, and reads 0 while any of it
   * still shows above.
   */
  get textNoteAltitude(): number {
    let ret = this.altitude;
    if (this.isUpright && this.altitude < 0) {
      if (-this.height <= this.altitude) return 0;
      ret += this.height;
    }
    return +ret.toFixed(1);
  }

  /**
   * Whether the note stands up rather than lying flat on the table; setting it writes straight to
   * the note.
   */
  get isUpright(): boolean {
    return this.textNote().isUpright;
  }
  set isUpright(isUpright: boolean) {
    this.textNote().isUpright = isUpright;
  }

  /**
   * Whether the note shows a line and label for its altitude; setting it writes straight to the
   * note.
   */
  get isAltitudeIndicate(): boolean {
    return this.textNote().isAltitudeIndicate;
  }
  set isAltitudeIndicate(isAltitudeIndicate: boolean) {
    this.textNote().isAltitudeIndicate = isAltitudeIndicate;
  }

  /**
   * Whether the note is being edited, which keeps it from being dragged and its menu from opening.
   */
  get isSelected(): boolean {
    return this.isEditing();
  }

  private callbackOnMouseUp = (e: MouseEvent) => this.onMouseUp(e);

  /** The size of one table cell, in pixels. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }
  math = Math;

  private _transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly _transition = signal(false);
  /**
   * Whether the note animates as it stands up or lies down.
   *
   * Setting it true runs the animation for 132 ms and then turns it off again.
   */
  get transition(): boolean {
    return this._transition();
  }
  set transition(transition: boolean) {
    if (this._transitionTimeout) clearTimeout(this._transitionTimeout);
    if (transition) {
      this._transition.set(true);
      this._transitionTimeout = setTimeout(() => {
        this._transition.set(false);
      }, 132);
    } else {
      this._transition.set(false);
      this._transitionTimeout = null;
    }
  }
  private _fallTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly _fall = signal(false);
  /**
   * Whether the note animates a drop with a slight bounce.
   *
   * Setting it true runs the animation for 132 ms and then turns it off again.
   */
  get fall(): boolean {
    return this._fall();
  }
  set fall(fall: boolean) {
    if (this._fallTimeout) clearTimeout(this._fallTimeout);
    if (fall) {
      this._fall.set(true);
      this._fallTimeout = setTimeout(() => {
        this._fall.set(false);
      }, 132);
    } else {
      this._fall.set(false);
      this._fallTimeout = null;
    }
  }

  private calcFitHeightTimer: ReturnType<typeof setTimeout> | null = null;
  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
  });

  private get input() {
    return this.inputRef.current;
  }
  readonly viewRotateZ = this.uiSignalService.tableViewRotationZ;

  /** Stops the browser starting a native drag on the note. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * Brings the note to the top when it is pressed, and waits for the release to start editing.
   *
   * Ignored while the note is being edited. A right press only brings the note to the top.
   */
  onMouseDown(e: MouseEvent) {
    if (this.isSelected) return;
    e.preventDefault();
    this.textNote().toTopmost();

    if (e.button === 2) return;
    this.addMouseEventListeners();
  }

  /**
   * Starts editing when a press on the note is let go without the pointer having moved, clearing
   * any text selection first.
   */
  onMouseUp(e: MouseEvent) {
    if (this.pointerDeviceService.isAllowedToOpenContextMenu) {
      const selection = window.getSelection();
      if (!selection!.isCollapsed) selection!.removeAllRanges();

      this.enterEdit();
    }
    this.removeMouseEventListeners();
    e.preventDefault();
  }

  /** Keeps a press on a rotate handle from bringing the note to the top or starting an edit. */
  onRotateMouseDown(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** Cancels the input handler's gesture as soon as a press starts. */
  onInputStart(_e: Event) {
    this.input!.cancel();
  }

  /**
   * Opens the note's right-click menu, or the menu for the whole selection when the note is part of
   * one.
   *
   * While the note is being edited the browser's own menu is left to the text area. In the flat
   * view with a radial menu style chosen, it opens as a radial menu.
   */
  onContextMenu(e: MouseEvent) {
    this.removeMouseEventListeners();
    if (this.isSelected) return;
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const position = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.textNote(), this.gridSize, position)) return;
    const surfaceEntries = buildSurfaceSwitchContextMenu(
      this.textNote(),
      this.tabletopService.currentTable,
      this.translateFn
    );
    const menu = buildTextNoteContextMenuModel(
      this.textNote(),
      this.gridSize,
      this.inventoryService,
      {
        onSetUpright: (isUpright) => {
          this.transition = true;
          this.textNote().isUpright = isUpright;
        },
        onShowDetail: () => this.showDetail(this.textNote()),
      },
      this.translateFn,
      surfaceEntries
    );
    const display = this.tabletopService.display();
    if (this.tabletopService.mode2d() && display.tabletopMenuStyle !== 'standard') {
      this.contextMenuService.openRadial(
        position,
        menu.actions,
        menu.radialGroups,
        this.title(),
        display.tabletopMenuStyle === 'radial',
        display.radialMenuRotationSpeed,
        multiAngleFontScaleFactor(display.multiAngleFontScale)
      );
      return;
    }
    this.contextMenuService.open(position, menu.actions, this.title());
  }

  /** Plays the pick-up sound when a drag or turn of the note starts. */
  onMove() {
    SoundEffect.play(PresetSound.cardPick);
  }

  /** Plays the put-down sound when a drag or turn of the note ends. */
  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  /** Refits the text area's height on the next task, gathering repeated requests into one. */
  calcFitHeightIfNeeded() {
    if (this.calcFitHeightTimer) return;
    this.calcFitHeightTimer = setTimeout(() => {
      this.calcFitHeight();
      this.calcFitHeightTimer = null;
    }, 0);
  }

  oldScrollHeight = 0;
  oldOffsetHeight = 0;

  /**
   * Sizes the text area to its content when the note limits its height, up to the note's height
   * less its title bar.
   *
   * Otherwise the height is left to the stylesheet, which fills the note.
   */
  calcFitHeight() {
    const textArea: HTMLTextAreaElement | undefined = this.textAreaElementRef()?.nativeElement;
    if (!textArea) return;

    if (!this.textNote().limitHeight) {
      // The inline height is cleared so the stylesheet can fill the parent.
      textArea.style.height = '';
    } else {
      textArea.style.height = '0';
      let textAreaHeight = textArea.scrollHeight;
      let textAreaMax = this.height * this.gridSize - 2;

      if (textAreaMax < this.gridSize) textAreaMax = this.gridSize - 2;
      if (this.title().length) {
        textAreaMax -= 32;
      } else {
        textAreaMax -= 2;
      }
      if (textAreaHeight > textAreaMax) textAreaHeight = textAreaMax;
      textArea.style.height = textAreaHeight + 'px';
    }
  }

  private addMouseEventListeners() {
    document.body.addEventListener('mouseup', this.callbackOnMouseUp, false);
  }

  private removeMouseEventListeners() {
    document.body.removeEventListener('mouseup', this.callbackOnMouseUp, false);
  }

  private showDetail(gameObject: TextNote) {
    if (!this.disclosureService.canView(gameObject)) return;
    const title = sheetPanelTitle(this.translateFn('feature.tabletop.panel.textNote'), gameObject.title);
    this.objectPanels.openSheet(gameObject, title, { width: 700, height: 400 });
  }
}
