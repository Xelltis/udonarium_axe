import { computed, inject, Injectable } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { RangeArea } from '@axe/domain/tabletop/range';
import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { tableWallSettings } from '@axe/domain/tabletop/table-walls';
import { boardSurfaceOf, surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { cardSprites, cardStackSprites, SizedPicture } from '@axe/domain/tabletop/world/card-sprites';
import { DICE_FRAME_COLOUR, diceSymbolSprites } from '@axe/domain/tabletop/world/dice-symbol-sprites';
import { maskSprites, rangeSprites } from '@axe/domain/tabletop/world/flat-piece-sprites';
import { tableCoinOf, TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { textNoteSprites } from '@axe/domain/tabletop/world/text-note-sprites';
import { whiteBoardSprites } from '@axe/domain/tabletop/world/white-board-sprites';

/** The theme's colour a frame takes for a piece that is somebody's, as the page names it. */
const OWNED_FRAME_COLOUR_PROPERTY = '--ui-panel-border';
/** The theme's colour of the plate a stack of cards shows its top card on, as the page names it. */
const STACK_PLATE_COLOUR_PROPERTY = '--ui-elevated';
/** The plate's colour where the theme cannot be read. */
const STACK_PLATE_COLOUR = '#21262d';

/** Where a piece is drawn: on which face, at which corner of it, and how far off it. */
interface DrawnPlace {
  readonly frame: SurfaceFrame;
  readonly onFloor: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * How the pieces on the table in view are drawn, worked out for this seat: the sprites most are
 * drawn with, and the coins. What the seat may not see is left out, and a piece it is moving is
 * drawn where it is being moved to.
 *
 * Both the canvas that draws the table and the picking that says what a press lands on read them,
 * so a piece is pressed where it is drawn.
 */
@Injectable({ providedIn: 'root' })
export class TablePiecesService {
  private readonly tabletop = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly images = inject(ImageService);
  private readonly pictureSizes = inject(PictureSizeService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly vision = inject(VisionService);
  private readonly transient = inject(TransientPlacementService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly theme = inject(ThemeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly pagePictures = inject(PiecePicturesService);

  /** Every sprite of every piece drawn on the table in view. */
  readonly sprites = computed<readonly TableWorldSprite[]>(() => [
    ...this.boardSprites(),
    ...this.maskSprites(),
    ...this.rangeSprites(),
    ...this.noteSprites(),
    ...this.cardSprites(),
    ...this.diceSprites(),
  ]);

  /** Every coin on the table in view. */
  readonly coins = computed<readonly TableWorldCoin[]>(() => {
    this.objectChange.collectionOf(Coin.aliasName)();
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.objectChange.fileVersion();
    this.transient.version();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const coins: TableWorldCoin[] = [];
    for (const coin of this.tabletop.coins) {
      this.objectChange.versionOf(coin.identifier)();
      const size = coin.size > 0 ? coin.size : 1;
      if (this.vision.isPieceHiddenByFog(coin, size)) continue;
      const place = this.placeOf(coin);
      if (!place) continue;
      const drawn = tableCoinOf({
        id: coin.identifier,
        ...place,
        sizePx: size * gridSize,
        rotateDeg: coin.rotate,
        backUp: coin.face === 'back',
        frontPictureUrl: this.images.getEmptyOr(coin.frontImage).url,
        backPictureUrl: this.images.getEmptyOr(coin.backImage).url,
      });
      if (drawn) coins.push(drawn);
    }
    return coins;
  });

  /** The walls drawn on the table in view, which are drawn only with a picture. */
  private readonly drawnWalls = computed<ReadonlySet<string>>(() => {
    this.objectChange.fileVersion();
    return new Set(
      tableWallSettings(this.tabletop.currentTableVersion())
        .filter((wall) => wall.shown && this.images.getEmptyOr(wall.imageIdentifier).url)
        .map((wall) => wall.surface)
    );
  });

  /** The white boards, drawn from the pictures the page takes of their faces. */
  private readonly boardSprites = computed(() => {
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.transient.version();
    const sprites: TableWorldSprite[] = [];
    for (const board of this.tabletop.whiteBoards) {
      this.objectChange.versionOf(board.identifier)();
      const frame = this.surfaces.frameOf(board.identifier);
      if (!frame) continue;
      sprites.push(
        ...whiteBoardSprites({ id: board.identifier, frame, picture: this.pagePictures.pictureOf(board.identifier) })
      );
    }
    return sprites;
  });

  /** The map masks, drawn from the pictures the page takes of them cut to their open cells. */
  private readonly maskSprites = computed(() => {
    this.objectChange.collectionOf(GameTableMask.aliasName)();
    this.transient.version();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const sprites: TableWorldSprite[] = [];
    for (const mask of this.tabletop.tableMasks) {
      this.objectChange.versionOf(mask.identifier)();
      const place = this.placeOf(mask);
      if (!place) continue;
      sprites.push(
        ...maskSprites({
          id: mask.identifier,
          ...place,
          altitudePx: mask.altitude * gridSize,
          picture: this.pagePictures.pictureOf(mask.identifier),
        })
      );
    }
    return sprites;
  });

  /** The ranges, drawn from the pictures the page takes of their cells. */
  private readonly rangeSprites = computed(() => {
    this.objectChange.collectionOf(RangeArea.aliasName)();
    this.transient.version();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const sprites: TableWorldSprite[] = [];
    for (const range of this.tabletop.ranges) {
      this.objectChange.versionOf(range.identifier)();
      const place = this.placeOf(range);
      if (!place) continue;
      sprites.push(
        ...rangeSprites({
          id: range.identifier,
          ...place,
          altitudePx: range.altitude * gridSize,
          picture: this.pagePictures.pictureOf(range.identifier),
        })
      );
    }
    return sprites;
  });

  /** The notes, drawn from the pictures the page takes of their panels. */
  private readonly noteSprites = computed(() => {
    this.objectChange.collectionOf(TextNote.aliasName)();
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.transient.version();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const sprites: TableWorldSprite[] = [];
    for (const note of this.tabletop.textNotes) {
      this.objectChange.versionOf(note.identifier)();
      if (this.vision.isPieceHiddenByFog(note, 1)) continue;
      const place = this.placeOf(note);
      if (!place) continue;
      sprites.push(
        ...textNoteSprites({
          id: note.identifier,
          ...place,
          altitudePx: note.altitude * gridSize,
          rotateDeg: note.rotate,
          upright: note.isUpright,
          face: this.pagePictures.pictureOf(note.identifier),
        })
      );
    }
    return sprites;
  });

  private readonly cardSprites = computed(() => {
    this.objectChange.collectionOf(Card.aliasName)();
    this.objectChange.collectionOf(CardStack.aliasName)();
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.objectChange.fileVersion();
    this.objectChange.networkVersion();
    this.objectChange.trackMyCursor();
    this.transient.version();
    this.theme.resolved();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const thick = !this.tabletop.mode2d();
    const plate = this.themeColour(STACK_PLATE_COLOUR_PROPERTY, STACK_PLATE_COLOUR);
    const sprites: TableWorldSprite[] = [];
    for (const card of this.tabletop.cards) {
      this.objectChange.versionOf(card.identifier)();
      const size = Math.max(0, card.size);
      if (this.vision.isPieceHiddenByFog(card, size)) continue;
      const place = this.placeOf(card);
      if (!place) continue;
      sprites.push(
        ...cardSprites({
          id: card.identifier,
          ...place,
          zindex: card.zindex,
          rotateDeg: card.rotate,
          widthPx: size * gridSize,
          picture: this.sized(this.images.getSkeletonOr(card.isFront ? card.frontImage : card.backImage).url),
          peek: card.isPeeking ? this.sized(this.images.getSkeletonOr(card.frontImage).url) : null,
        })
      );
    }
    for (const stack of this.tabletop.cardStacks) {
      this.objectChange.versionOf(stack.identifier)();
      const top = stack.topCard;
      const size = top ? top.size : 2;
      if (this.vision.isPieceHiddenByFog(stack, size)) continue;
      const place = this.placeOf(stack);
      if (!place) continue;
      sprites.push(
        ...cardStackSprites({
          id: stack.identifier,
          ...place,
          zindex: stack.zindex,
          rotateDeg: stack.rotate,
          widthPx: size * gridSize,
          cardCount: stack.cards.length,
          thick: thick && surfaceOf(stack) === 'floor',
          top: top
            ? { picture: this.sized(this.images.getSkeletonOr(stack.imageFile).url), rotateDeg: top.rotate }
            : null,
          plateColour: plate,
        })
      );
    }
    return sprites;
  });

  /** A picture with how big it is, or null while that is not known. */
  private sized(url: string): SizedPicture | null {
    const size = url ? this.pictureSizes.sizeOf(url) : null;
    return size ? { url, ...size } : null;
  }

  private readonly diceSprites = computed(() => {
    this.objectChange.collectionOf(DiceSymbol.aliasName)();
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.objectChange.fileVersion();
    this.objectChange.networkVersion();
    this.objectChange.trackMyCursor();
    this.transient.version();
    this.theme.resolved();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const facesEye = this.tabletop.imageBillboard() || this.tabletop.mode2d();
    const owned = this.themeColour(OWNED_FRAME_COLOUR_PROPERTY, DICE_FRAME_COLOUR);
    const sprites: TableWorldSprite[] = [];
    for (const die of this.tabletop.diceSymbols) {
      this.objectChange.versionOf(die.identifier)();
      const size = Math.max(0, die.size);
      if (this.vision.isPieceHiddenByFog(die, size)) continue;
      const place = this.placeOf(die);
      if (!place) continue;
      const url = this.images.getEmptyOr(die.imageFile).url;
      const picture = url ? this.pictureSizes.sizeOf(url) : null;
      const reads = die.isVisible || this.rolePermission.canSeeHidden();
      sprites.push(
        ...diceSymbolSprites({
          id: die.identifier,
          ...place,
          sizePx: size * gridSize,
          rotateDeg: die.rotate,
          picture: picture ? { url, ...picture } : null,
          pictureHeightPx: die.specifyKomaImageFlag ? +die.komaImageHeight : null,
          facesEye,
          pictureBrightness: !reads ? 0 : die.isMine ? 0.5 : die.isUsed ? 0.45 : 1,
          frameBrightness: die.isUsed ? 0.45 : 1,
          frameColour: die.hasOwner ? owned : DICE_FRAME_COLOUR,
        })
      );
    }
    return sprites;
  });

  /**
   * Where a piece is drawn: where this seat is moving it, or where it stands. A piece on a wall the
   * table does not draw, or on a board no longer there, is drawn on the floor, as the page draws it.
   */
  private placeOf(piece: TabletopObject): DrawnPlace | null {
    const moving = this.transient.placementOf(piece.identifier);
    const named = moving?.surface ?? (boardSurfaceOf(piece) || surfaceOf(piece));
    const board = this.objectStore.get(named);
    if (board instanceof WhiteBoard) this.objectChange.versionOf(board.identifier)();
    const surface = board instanceof WhiteBoard || this.drawnWalls().has(named) ? named : 'floor';
    const frame = this.surfaces.frameOf(surface);
    if (!frame) return null;
    return {
      frame,
      onFloor: surface === 'floor',
      x: moving?.x ?? piece.location.x,
      y: moving?.y ?? piece.location.y,
      z: moving?.z ?? piece.posZ,
    };
  }

  /** A colour of the theme on screen, as the page names it, or the colour given where it cannot be read. */
  private themeColour(property: string, otherwise: string): string {
    if (typeof getComputedStyle !== 'function') return otherwise;
    const colour = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    return colour || otherwise;
  }
}
