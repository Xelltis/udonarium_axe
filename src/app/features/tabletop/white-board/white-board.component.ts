import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { WhiteBoardService } from '@axe/application/tabletop/white-board.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { isInStore, ObjectStore } from '@axe/core/sync/object-store';
import { PERF_DESERIALIZE_SCENE, perfCounters } from '@axe/core/util/perf-counters';
import { deserializeScene } from '@axe/domain/map-editor/serialize';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { clearToBlankTable, putAwayTutorial } from '@axe/features/tabletop/tutorial/put-away-tutorial';
import { AnimatedImageService } from '@axe/features/tabletop/white-board/animated-image.service';
import { buildWhiteBoardContextMenu } from '@axe/features/tabletop/white-board/white-board-context-menu';
import { LivePicture, livePicturesOf } from '@axe/features/tabletop/white-board/white-board-live-pictures';
import { MovableDirective, MovableOption } from '@axe/ui/directives/movable.directive';
import { RotableDirective, RotableOption } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { pictureForCanvas } from '@axe/ui/tabletop/picture-for-canvas';
import { setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { TurnFrameComponent, type TurnStand } from '@axe/ui/tabletop/turn-frame/turn-frame.component';

@Component({
  selector: 'white-board',
  templateUrl: './white-board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TurnFrameComponent,
    NgTemplateOutlet,
    HudPlaceDirective,
    MovableDirective,
    RotableDirective,
    SelectableDirective,
    TooltipDirective,
    SafePipe,
  ],
  host: {
    class: 'block',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class WhiteBoardComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly tabletopService = inject(TabletopService);
  private readonly boards = inject(WhiteBoardService);
  private readonly objectStore = inject(ObjectStore);
  private readonly panelService = inject(PanelService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly translateFn = inject(TRANSLATE_FN);
  private readonly animatedImage = inject(AnimatedImageService);
  private readonly imageStorage = inject(ImageStorage);

  readonly whiteBoard = input.required<WhiteBoard>();
  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  /**
   * What the board wears, laid out here for the table's canvas to draw the board from a picture of
   * it: left clear, still taking the presses where the canvas draws it.
   */
  private readonly face = viewChild<ElementRef<HTMLElement>>('face');
  private readonly pieces = inject(TablePiecesService);
  /** The corners of the board's face at its foot, where its handles stand over a canvas: bottom left and bottom right. */
  /**
   * Where the board stands for the frame that turns it, about the middle of its foot: round all it
   * covers of the face it stands on, which is the whole of it lying flat and only its foot standing up.
   */
  protected readonly turnStand = computed<TurnStand>(() => {
    const board = this.version();
    const foot = this.pieces.footOf(board);
    const width = board.width * this.gridSize;
    const height = board.height * this.gridSize;
    const depth = Math.max(0, height * Math.cos((board.pitch * Math.PI) / 180));
    const footY = foot.y + height;
    return {
      surface: foot.surface,
      height: foot.height,
      foot: {
        left: foot.x,
        top: footY - depth,
        width,
        depth,
        pivot: { x: foot.x + width / 2, y: footY },
        rotateDeg: board.rotate,
      },
    };
  });

  constructor() {
    setupMovableRotableForPiece(this, {
      target: this.whiteBoard,
      footprint: () => ({ width: this.widthPx(), height: this.heightPx() }),
      turnsAbout: (board) => {
        const foot = this.pieces.footOf(board);
        return { ...foot, x: foot.x + this.widthPx() / 2, y: foot.y + this.heightPx() };
      },
    });
    pictureForCanvas({
      identifier: () => this.whiteBoard().identifier,
      element: () => this.face()?.nativeElement,
      pictured: () => true,
      follows: () => {
        this.widthPx();
        this.heightPx();
        this.opacity();
        this.color();
        this.imageUrl();
      },
    });
  }

  /** The table's grid cell size in pixels, which the board's width and height are counted in. */
  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  /**
   * Reads the version, then hands back the board.
   *
   * It is the same board every time, so under the default equality a new version never
   * reaches anything that reads this.
   */
  private readonly version = computed(
    () => {
      const board = this.whiteBoard();
      this.objectChange.versionOf(board.identifier)();
      // The picture a board wears arrives after the name of it does, so the bytes landing has
      // to move the view as well; without it a board would stay blank for everybody else until
      // it is dragged.
      this.objectChange.fileVersion();
      return board;
    },
    { equal: () => false }
  );

  readonly isLock = computed(() => this.version().isLock);
  readonly widthPx = computed(() => this.version().width * this.gridSize);
  readonly heightPx = computed(() => this.version().height * this.gridSize);
  readonly opacity = computed(() => this.version().opacity);
  readonly color = computed(() => this.version().color);

  readonly imageUrl = computed(() => this.version().imageFile.url);

  /**
   * The drawings on the board that move, which the flat picture it wears cannot show.
   *
   * They are hung over the picture in the place the paint would have put them, so a board
   * with a moving picture on it looks the same and moves as well.
   */
  private readonly sceneText = computed(() => this.version().scene);

  private readonly scene = computed(() => {
    perfCounters.bump(PERF_DESERIALIZE_SCENE);
    return deserializeScene(this.sceneText());
  });

  readonly livePictures = computed<(LivePicture & { url: string })[]>(() => {
    this.version();
    return livePicturesOf(this.scene(), this.widthPx(), this.heightPx(), (identifier) =>
      this.animatedImage.isAnimated(identifier)
    )
      .map((picture) => ({ ...picture, url: this.imageStorage.get(picture.imageIdentifier)?.url ?? '' }))
      .filter((picture) => picture.url.length > 0);
  });

  /** Plays the pick-up sound when a drag or a turn of the board begins. */
  onMove(): void {
    SoundEffect.play(PresetSound.cardPick);
  }

  /** Plays the put-down sound when a drag or a turn of the board ends. */
  onMoved(): void {
    SoundEffect.play(PresetSound.cardPut);
  }

  /** Writes the angle the board has been turned to onto the synced board. */
  onRotated(degree: number): void {
    this.whiteBoard().rotate = degree;
  }

  /**
   * Opens the board's right-click menu at the pointer.
   *
   * When several pieces are selected, the menu for the selection opens instead.
   */
  onContextMenu(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const board = this.whiteBoard();
    const position = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(board, this.gridSize, position)) return;

    const menu = buildWhiteBoardContextMenu(board, this.boards.standingOn(board).length, this.translateFn, {
      onDraw: (target) => this.openDrawing(target),
      onDetachAll: (target) => this.detachAll(target),
      onCopy: (target) => this.copy(target),
      onSave: (target) => void this.save(target),
      onDelete: (target) => this.remove(target),
      onPutAwayTutorial: () => {
        putAwayTutorial(this.tabletopService, this.objectStore);
        SoundEffect.play(PresetSound.sweep);
      },
      onClearToBlankTable: () => {
        clearToBlankTable(this.tabletopService, this.objectStore);
        SoundEffect.play(PresetSound.sweep);
      },
    });
    this.contextMenuService.open(position, menu, board.name);
  }

  /** Everything on the board goes back to the table, keeping the place it appears to be in. */
  detachAll(board: WhiteBoard): void {
    this.boards.clear(board);
    SoundEffect.play(PresetSound.cardPut);
  }

  private copy(board: WhiteBoard): void {
    const clone = this.objectStore.get<WhiteBoard>(board.identifier)?.clone();
    if (!clone) return;
    clone.location.x += this.gridSize;
    clone.location.y += this.gridSize;
    clone.isLock = false;
    if (board.parent) board.parent.appendChild(clone);
    clone.update();
    SoundEffect.play(PresetSound.cardPut);
  }

  /**
   * The board on its own, drawing and all, as a file that can be carried to another room.
   *
   * What is standing on the board is not part of it: those are the room's pieces, which
   * happen to be resting there, and each is saved on its own if it is wanted.
   */
  private async save(board: WhiteBoard): Promise<void> {
    await this.saveDataService.saveGameObjectAsync(board, `whiteboard_${board.name}`);
  }

  private remove(board: WhiteBoard): void {
    this.boards.takeDown(board);
    SoundEffect.play(PresetSound.sweep);
  }

  /** The board's own drawing, opened in the editor that draws maps, since a board is one. */
  private openDrawing(board: WhiteBoard): void {
    const option: PanelOption = {
      title: board.name,
      width: 960,
      height: 640,
      single: `white-board-${board.identifier}`,
      stillWanted: () => isInStore(board),
    };
    this.panelService.openLazy(
      () =>
        import('@axe/features/tabletop/white-board/white-board-editor.component').then(
          (m) => m.WhiteBoardEditorComponent
        ),
      option,
      (panel) => panel.bindToBoard(board)
    );
  }
}
