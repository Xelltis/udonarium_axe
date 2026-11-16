import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
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
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { debounce } from '@axe/core/util/debounce';
import { paintedColorOf } from '@axe/core/util/painted-color';
import { DataElement } from '@axe/domain/data/data-element';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { buildTextNoteContextMenuModel } from '@axe/features/tabletop/text-note/text-note-context-menu';
import { clearToBlankTable, putAwayTutorial } from '@axe/features/tabletop/tutorial/put-away-tutorial';
import { AltitudeGuideComponent, altitudeGuideOf } from '@axe/ui/components/altitude-guide/altitude-guide.component';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { pictureForCanvas } from '@axe/ui/tabletop/picture-for-canvas';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { TurnFrameComponent, type TurnStand } from '@axe/ui/tabletop/turn-frame/turn-frame.component';
import { decorateChatStyleText } from '@axe/ui/text-decoration/decorate-chat-text';
import { formatNoteText } from '@axe/ui/text-decoration/format-note-text';

/**
 * How much of its face a note covers as it is moved: the one point it hangs from, the middle of its
 * lower edge, so that it snaps and settles by that point alone.
 */
/** How many pixels larger than its font size setting a note's text is drawn. */
const FONT_BASE_PX = 9;

const NOTE_FOOTPRINT = { width: 1, height: 0 } as const;

@Component({
  selector: 'text-note',
  templateUrl: './text-note.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TurnFrameComponent,
    AltitudeGuideComponent,
    HudPlaceDirective,
    MovableDirective,
    RotableDirective,
    SelectableDirective,
    NgTemplateOutlet,
    FormsModule,
    LinkifyPipe,
    SafePipe,
  ],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    '[attr.data-object-id]': 'textNote().identifier',
    class: 'block',
    '(dragstart)': 'onDragstart($event)',
    '(mousedown)': 'onMouseDown($event)',
    '(document:mouseup)': 'onMouseUp($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class TextNoteComponent {
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
  /**
   * Whether the note stops at its height and scrolls a longer text inside, rather than growing to
   * fit it.
   */
  readonly limitHeight = computed(() => {
    const note = this.textNote();
    if (!note) return false;
    this.objectChange.versionOf(note.identifier)();
    return note.limitHeight;
  });
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly visionService = inject(VisionService);
  protected readonly tabletopService = inject(TabletopService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly translateFn = inject(TRANSLATE_FN);
  /**
   * Where the note stands for the frame that turns it, about the middle of its lower edge, which is
   * where it hangs from: round the whole of it where it lies, along its foot where it stands up.
   */
  protected readonly turnStand = computed<TurnStand>(() => {
    const note = this.textNote();
    this.ownVersion();
    const foot = this.pieces.footOf(note);
    const width = this.width() * this.gridSize();
    const depth = this.isUpright() ? 0 : this.height() * this.gridSize();
    return {
      surface: foot.surface,
      height: foot.height + Math.max(0, this.altitude()) * this.gridSize(),
      foot: {
        left: foot.x - width / 2,
        top: foot.y - depth,
        width,
        depth,
        pivot: { x: foot.x, y: foot.y },
        rotateDeg: note.rotate,
      },
    };
  });

  private readonly pieces = inject(TablePiecesService);
  /**
   * The note's panel, laid out here for the table's canvas to draw the note from a picture of it:
   * left clear, still taking the presses where the canvas draws it, until it is written in.
   */
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

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
      footprint: () => NOTE_FOOTPRINT,
    });
    pictureForCanvas({
      identifier: () => this.textNote().identifier,
      element: () => this.panel()?.nativeElement,
      pictured: () => true,
      follows: () => {
        this.textNoteVersion();
        this.canView();
        this.limitHeight();
        this.imageFile();
      },
      paper: (panel) => paintedColorOf(getComputedStyle(panel).backgroundColor),
    });
    this.destroyRef.onDestroy(() => {
      this.writeTextSoon.cancel();
    });
    effect(() => {
      this.noteVersion();
      this.calcFitHeightIfNeeded();
    });
  }

  readonly textAreaElementRef = viewChild<ElementRef<HTMLTextAreaElement>>('textArea');

  readonly textNote = input.required<TextNote>();

  /** Follows the note and every element under it, however deep, which its text and font size are kept in. */
  private readonly noteVersion = computed(() => {
    const note = this.textNote();
    let v = this.objectChange.versionOf(note.identifier)();
    const trackChildren = (elms: readonly DataElement[]) => {
      for (const elm of elms) {
        v += this.objectChange.versionOf(elm.identifier)();
        if (elm.children.length) trackChildren(elm.children as DataElement[]);
      }
    };
    if (note.commonDataElement) trackChildren(note.commonDataElement.children as DataElement[]);
    return v;
  });

  /** Whether this seat may write the note, which a seat made a guest loses, and with it its draft. */
  private readonly mayWrite = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop();
  });

  /** Whether the note is being edited; a seat that loses the right to write it is taken out of editing. */
  readonly isEditing = linkedSignal<boolean, boolean>({ source: this.mayWrite, computation: () => false });
  readonly decoratedHtml = computed(() => {
    const note = this.textNote();
    this.objectChange.versionOf(note.identifier)();
    return decorateChatStyleText(this._text());
  });
  /** Whether the note is drawn with formatting, as whoever wrote it chose. */
  readonly formatted = computed(() => {
    const note = this.textNote();
    this.objectChange.versionOf(note.identifier)();
    return note.isFormatted;
  });
  readonly formattedHtml = computed(() => (this.formatted() ? formatNoteText(this._text()) : ''));
  readonly maskedHtml = computed(() => {
    const note = this.textNote();
    this.objectChange.versionOf(note.identifier)();
    return this._text().replace(/\S/g, '█');
  });
  readonly maskedTitle = computed(() => this.title().replace(/\S/g, '█'));

  /**
   * Switches the note into editing and puts the caret at the end of its text.
   *
   * Does nothing for a user who cannot edit the tabletop, on a locked note, when the note is
   * already being edited, or for a reader the note is kept from, whose field would show the text
   * it hides and write back whatever was typed over it.
   */
  enterEdit() {
    if (!this.rolePermission.canEditTabletop()) return;
    if (!this.canView()) return;
    if (this.textNote().isLock) return;
    if (this.isEditing()) return;
    this.isEditing.set(true);
    afterNextRender(
      () => {
        const el = this.textAreaElementRef()?.nativeElement;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        this.calcFitHeight();
      },
      { injector: this.injector }
    );
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

  /** Follows every change to the note and its elements, for the picture the canvas draws of it. */
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

  /** Follows the note itself, which its lock and standing are kept on. */
  private readonly ownVersion = computed(() => this.objectChange.versionOf(this.textNote().identifier)());

  /** Whether the note is locked, which keeps it from being moved or edited. */
  readonly isLock = computed(() => {
    this.ownVersion();
    return this.textNote().isLock;
  });

  /**
   * The note's text as held by the text area: the note's own, taken afresh whenever the note or
   * this seat's right to write it changes, and in between whatever has been typed. A seat made a
   * guest while it wrote is left with the note as the room has it, the draft unwritten.
   */
  private readonly _text = linkedSignal(() => {
    this.noteVersion();
    this.mayWrite();
    return this.textNote().text;
  });
  private readonly _fontSize = computed(() => {
    this.noteVersion();
    return this.textNote().fontSize;
  });
  private readonly writeTextSoon = debounce(() => {
    const note = this.textNote();
    if (note.text !== this._text()) note.text = this._text();
    this.calcFitHeightIfNeeded();
  }, 66);

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
    this.writeTextSoon();
  }
  /** The note's font size setting; the text is drawn at this many pixels plus `FONT_BASE_PX`. */
  readonly fontSize = this._fontSize;
  /** The size the note's text is drawn at, in pixels. */
  protected readonly fontPx = computed(() => this._fontSize() + FONT_BASE_PX);

  readonly imageFile = computed(() => {
    this.objectChange.fileVersion();
    const textNote = this.textNote();
    this.objectChange.versionOf(textNote.identifier)();
    return textNote.imageFile;
  });
  /** The note's height in cells, never negative. */
  readonly height = computed(() => {
    this.noteVersion();
    return Math.max(0, this.textNote().height);
  });
  /** The note's width in cells, never negative. */
  readonly width = computed(() => {
    this.noteVersion();
    return Math.max(0, this.textNote().width);
  });

  /** How high the note floats above the table, in cells. */
  readonly altitude = computed(() => {
    this.noteVersion();
    return this.textNote().altitude;
  });

  /** Whether the note stands up rather than lying flat on the table. */
  readonly isUpright = computed(() => {
    this.ownVersion();
    return this.textNote().isUpright;
  });

  /**
   * The altitude shown on the altitude label, rounded to one decimal place.
   *
   * A standing note sunk under the table is measured from its top edge, and reads 0 while any of it
   * still shows above.
   */
  readonly textNoteAltitude = computed(() => {
    const altitude = this.altitude();
    let ret = altitude;
    if (this.isUpright() && altitude < 0) {
      if (-this.height() <= altitude) return 0;
      ret += this.height();
    }
    return +ret.toFixed(1);
  });

  /** Whether a press on the note waits for its release, which is heard on the document. */
  private pressed = false;

  /** The size of one table cell, in pixels. */
  readonly gridSize = this.tabletopService.gridSize;

  /**
   * The guide from the height the note floats at to the face it stands on, with the height written
   * at its end: up from the face to a note raised off it, or down to the top of one sunk under it.
   * Nothing for a note within half a cell of the face, or one set not to show it.
   */
  protected readonly altitudeGuide = computed(() => {
    const note = this.textNote();
    this.objectChange.versionOf(note.identifier)();
    if (!note.isAltitudeIndicate) return null;
    return altitudeGuideOf(this.pieces.footOf(note), this.textNoteAltitude(), this.gridSize());
  });

  private fitHeightPending = false;
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

  /** Stops the browser starting a native drag on the note. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * Brings the note to the top when it is pressed, for a seat that may change the table, and waits
   * for the release to start editing.
   *
   * Ignored while the note is being edited. A right press only brings the note to the top.
   */
  onMouseDown(e: MouseEvent) {
    if (this.isEditing()) return;
    e.preventDefault();
    if (this.rolePermission.canEditTabletop()) this.textNote().toTopmost();

    if (e.button === 2) return;
    this.pressed = true;
  }

  /**
   * Starts editing when a press on the note is let go without the pointer having moved, clearing
   * any text selection first.
   *
   * Heard on the document, so a release off the note ends the press too; a release with no press
   * on the note waiting is left alone.
   */
  onMouseUp(e: MouseEvent) {
    if (!this.pressed) return;
    this.pressed = false;
    if (this.pointerDeviceService.isAllowedToOpenContextMenu) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();

      this.enterEdit();
    }
    e.preventDefault();
  }

  /** Keeps a press on a rotate handle from bringing the note to the top or starting an edit. */
  onRotateMouseDown(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** Cancels the input handler's gesture as soon as a press starts. */
  onInputStart(_e: Event) {
    this.input?.cancel();
  }

  /**
   * Opens the note's right-click menu, or the menu for the whole selection when the note is part of
   * one.
   *
   * While the note is being edited the browser's own menu is left to the text area. In the flat
   * view with a radial menu style chosen, it opens as a radial menu.
   */
  onContextMenu(e: MouseEvent) {
    this.pressed = false;
    if (this.isEditing()) return;
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const position = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.textNote(), this.gridSize(), position)) return;
    const surfaceEntries = buildSurfaceSwitchContextMenu(
      this.textNote(),
      this.tabletopService.currentTable,
      this.translateFn
    );
    const menu = buildTextNoteContextMenuModel(
      this.textNote(),
      this.gridSize(),
      this.inventoryService,
      {
        onSetUpright: (isUpright) => {
          this.textNote().isUpright = isUpright;
        },
        onShowDetail: () => this.showDetail(this.textNote()),
        onPutAwayTutorial: () => {
          putAwayTutorial(this.tabletopService, this.objectStore);
          SoundEffect.play(PresetSound.sweep);
        },
        onClearToBlankTable: () => {
          clearToBlankTable(this.tabletopService, this.objectStore);
          SoundEffect.play(PresetSound.sweep);
        },
      },
      this.translateFn,
      surfaceEntries
    );
    this.pieceContextMenu.openPieceMenu(position, menu, this.title());
  }

  /** Plays the pick-up sound when a drag or turn of the note starts. */
  onMove() {
    SoundEffect.play(PresetSound.cardPick);
  }

  /** Plays the put-down sound when a drag or turn of the note ends. */
  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  /** Refits the text area's height once the note is next drawn, gathering repeated requests into one. */
  calcFitHeightIfNeeded() {
    if (this.fitHeightPending) return;
    this.fitHeightPending = true;
    afterNextRender(
      () => {
        this.fitHeightPending = false;
        this.calcFitHeight();
      },
      { injector: this.injector }
    );
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
      let textAreaMax = this.height() * this.gridSize() - 2;

      if (textAreaMax < this.gridSize()) textAreaMax = this.gridSize() - 2;
      if (this.title().length) {
        textAreaMax -= 32;
      } else {
        textAreaMax -= 2;
      }
      if (textAreaHeight > textAreaMax) textAreaHeight = textAreaMax;
      textArea.style.height = textAreaHeight + 'px';
    }
  }

  private showDetail(gameObject: TextNote) {
    if (!this.disclosureService.canView(gameObject)) return;
    const title = sheetPanelTitle(this.translateFn('feature.tabletop.panel.textNote'), gameObject.title);
    this.objectPanels.openSheet(gameObject, title, { width: 700, height: 400 });
  }
}
