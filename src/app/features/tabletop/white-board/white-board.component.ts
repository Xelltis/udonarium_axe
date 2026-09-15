import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { AnimatedImageService } from '@axe/application/media/animated-image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_DESERIALIZE_SCENE, perfCounters } from '@axe/core/util/perf-counters';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { boardSurfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { CardComponent } from '@axe/features/card/card/card.component';
import { GameCharacterComponent } from '@axe/features/character/game-character/game-character.component';
import { DiceSymbolComponent } from '@axe/features/dice/dice-symbol/dice-symbol.component';
import { deserializeScene } from '@axe/features/map-editor/model/serialize';
import { GameTableMaskComponent } from '@axe/features/tabletop/game-table-mask/game-table-mask.component';
import { TerrainComponent } from '@axe/features/tabletop/terrain/terrain.component';
import { TextNoteComponent } from '@axe/features/tabletop/text-note/text-note.component';
import { detachAllFrom } from '@axe/features/tabletop/white-board/white-board-contents';
import { buildWhiteBoardContextMenu } from '@axe/features/tabletop/white-board/white-board-context-menu';
import { LivePicture, livePicturesOf } from '@axe/features/tabletop/white-board/white-board-live-pictures';
import { MovableDirective, MovableOption } from '@axe/ui/directives/movable.directive';
import { RotableDirective, RotableOption } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';

@Component({
  selector: 'white-board',
  templateUrl: './white-board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgStyle,
    MovableDirective,
    RotableDirective,
    SelectableDirective,
    TooltipDirective,
    SafePipe,
    GameCharacterComponent,
    TerrainComponent,
    GameTableMaskComponent,
    TextNoteComponent,
    CardComponent,
    DiceSymbolComponent,
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

  constructor() {
    setupMovableRotableForPiece(this, { target: this.whiteBoard });
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

  /**
   * Tilted about its lower edge, so that standing it up does not sink it into the table.
   *
   * Hinging on the middle would bury the near half of the board and lift the far half off
   * the ground, which is not what standing a board up looks like.
   */
  readonly pitchTransform = computed(() => `rotateX(${-this.version().pitch}deg)`);

  private readonly contentsOf = <T extends TabletopObject>(list: readonly T[]): T[] => {
    const identifier = this.whiteBoard().identifier;
    return list.filter((object) => boardSurfaceOf(object) === identifier);
  };

  /**
   * Reads the collections, then hands back the table.
   *
   * It is the same table every time, so under the default equality a piece put on the board
   * would never reach anything that reads this: the collection would say it has changed and the
   * answer that it has not.
   */
  private readonly surfaceVersion = computed(
    () => {
      for (const alias of ['character', 'terrain', 'table-mask', 'text-note', 'card', 'dice-symbol']) {
        this.objectChange.collectionOf(alias)();
      }
      return this.tabletopService.currentTable.identifier;
    },
    { equal: () => false }
  );

  readonly characters = computed<GameCharacter[]>(() => {
    this.surfaceVersion();
    return this.contentsOf(this.tabletopService.characters);
  });
  readonly terrains = computed<Terrain[]>(() => {
    this.surfaceVersion();
    return this.contentsOf(this.tabletopService.terrains);
  });
  readonly masks = computed<GameTableMask[]>(() => {
    this.surfaceVersion();
    return this.contentsOf(this.tabletopService.tableMasks);
  });
  readonly textNotes = computed<TextNote[]>(() => {
    this.surfaceVersion();
    return this.contentsOf(this.tabletopService.textNotes);
  });
  readonly cards = computed<Card[]>(() => {
    this.surfaceVersion();
    return this.contentsOf(this.tabletopService.cards);
  });
  readonly diceSymbols = computed<DiceSymbol[]>(() => {
    this.surfaceVersion();
    return this.contentsOf(this.tabletopService.diceSymbols);
  });

  readonly standingCount = computed(
    () =>
      this.characters().length +
      this.terrains().length +
      this.masks().length +
      this.textNotes().length +
      this.cards().length +
      this.diceSymbols().length
  );

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

    const menu = buildWhiteBoardContextMenu(board, this.standingCount(), this.translateFn, {
      onDraw: (target) => this.openDrawing(target),
      onDetachAll: (target) => this.detachAll(target),
      onCopy: (target) => this.copy(target),
      onSave: (target) => void this.save(target),
      onDelete: (target) => this.remove(target),
    });
    this.contextMenuService.open(position, menu, board.name);
  }

  /** Everything on the board goes back to the table, keeping the place it appears to be in. */
  detachAll(board: WhiteBoard): void {
    detachAllFrom(board, this.standing());
    SoundEffect.play(PresetSound.cardPut);
  }

  private standing(): TabletopObject[] {
    return [
      ...this.characters(),
      ...this.terrains(),
      ...this.masks(),
      ...this.textNotes(),
      ...this.cards(),
      ...this.diceSymbols(),
    ];
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
    this.detachAll(board);
    board.destroy();
    SoundEffect.play(PresetSound.sweep);
  }

  /** The board's own drawing, opened in the editor that draws maps, since a board is one. */
  private openDrawing(board: WhiteBoard): void {
    const option: PanelOption = {
      title: board.name,
      width: 960,
      height: 640,
      single: `white-board-${board.identifier}`,
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
