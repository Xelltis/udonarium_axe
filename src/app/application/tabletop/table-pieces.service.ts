import { computed, inject, Injectable, untracked } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { pieceImageWidthApart } from '@axe/domain/character/piece-image-size';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { groundLiftOfBlock } from '@axe/domain/tabletop/ground/ground-surface';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { canBeStoodOn } from '@axe/domain/tabletop/move/landing-height';
import { landingLeanAt } from '@axe/domain/tabletop/move/landing-height';
import { pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import { pieceModelOf } from '@axe/domain/tabletop/piece-model';
import { RangeArea } from '@axe/domain/tabletop/range';
import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { tableWallSettings } from '@axe/domain/tabletop/table-walls';
import { boardSurfaceOf, surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainCovers } from '@axe/domain/tabletop/terrain-box';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
import { terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';
import { SurfaceLean } from '@axe/domain/tabletop/terrain-slope-surface';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { cardSprites, cardStackSprites, SizedPicture } from '@axe/domain/tabletop/world/card-sprites';
import { characterRollPivot, characterSprites } from '@axe/domain/tabletop/world/character-sprites';
import { DICE_FRAME_COLOUR, diceSymbolSprites } from '@axe/domain/tabletop/world/dice-symbol-sprites';
import { maskSprites, rangeSprites } from '@axe/domain/tabletop/world/flat-piece-sprites';
import { lightSourceSprites } from '@axe/domain/tabletop/world/light-source-sprites';
import { MotionPivot, movedSprite } from '@axe/domain/tabletop/world/piece-motions';
import { tableCoinOf, TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import { type PagePicture, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
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

/** How faint the piece the table's camera follows is drawn while the camera stands near enough to look through it. */
const SEEN_THROUGH = 0.3;

/**
 * How the pieces on the table in view are drawn, worked out for this seat: the sprites most are
 * drawn with, and the coins. What the seat may not see is left out; a piece the seat is moving is
 * drawn where it is being moved to, and a piece playing a move where the move has it.
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
  private readonly eyes = inject(TableEyeService);
  private readonly ground = inject(GroundService);
  private readonly transient = inject(TransientPlacementService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly theme = inject(ThemeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly pagePictures = inject(PiecePicturesService);
  private readonly roomRules = inject(RoomRulesService);
  private readonly motions = inject(PieceMotionsService);
  private readonly modelStorage = inject(ModelStorage);

  /**
   * The characters this seat may see that are drawn as 3D models, held here in full, standing on the
   * floor: each stood at the middle of its footprint, walking while the seat moves it.
   */
  readonly models = computed<readonly TableWorldModel[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.fileVersion();
    this.transient.version();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const models: TableWorldModel[] = [];
    for (const character of this.tabletop.characters) {
      this.objectChange.versionOf(character.identifier)();
      const model = pieceModelOf(character);
      const url = model ? this.modelUrlOf(model.identifier) : '';
      if (!model || !url || !this.vision.isTokenVisible(character)) continue;
      const place = this.placeOf(character);
      if (!place?.onFloor) continue;
      const size = Math.max(0, character.size) * gridSize;
      models.push({
        owner: character.identifier,
        kind: GameCharacter.aliasName,
        url,
        model,
        foot: { x: place.x + size / 2, y: place.y + size / 2, z: place.z },
        footprintPx: size,
        heightPx: size * CHARACTER_MODEL_HEIGHT_CELLS,
        rotateDeg: character.rotate,
        walking: this.transient.placementOf(character.identifier) !== null,
      });
    }
    return models;
  });

  /** Where the bytes of a model held here in full are read from, or nothing for one not held. */
  modelUrlOf(identifier: string): string {
    const model = this.modelStorage.get(identifier);
    return model?.isReady ? model.url : '';
  }

  /** Every sprite of every piece drawn on the table in view, where it stands. */
  private readonly standing = computed<readonly TableWorldSprite[]>(() => [
    ...this.boardSprites(),
    ...this.lightSprites(),
    ...this.maskSprites(),
    ...this.rangeSprites(),
    ...this.noteSprites(),
    ...this.cardSprites(),
    ...this.diceSprites(),
    ...this.characterSprites(),
  ]);

  /**
   * Every sprite of every piece drawn on the table in view, a piece playing a move where the move
   * has it now. A piece moves about the middle of the first sprite of it lying on its face, as the
   * page moves it about the middle of where it stands.
   */
  readonly sprites = computed<readonly TableWorldSprite[]>(() => {
    const standing = this.standing();
    const poses = this.motions.posesNow();
    if (!poses.size) return standing;
    const pivots = new Map<string, MotionPivot>();
    for (const sprite of standing) {
      if (sprite.order === undefined || sprite.facing === 'eye' || pivots.has(sprite.owner)) continue;
      pivots.set(sprite.owner, { point: sprite.centre, across: sprite.facing.across, down: sprite.facing.down });
    }
    return standing.map((sprite) => {
      const playing = poses.get(sprite.owner);
      const pivot = pivots.get(sprite.owner);
      if (!playing || !pivot) return sprite;
      if (playing.parts && !playing.parts.includes(sprite.id.slice(sprite.id.lastIndexOf('#') + 1))) return sprite;
      return movedSprite(sprite, playing.pose, pivot);
    });
  });

  /** Every coin on the table in view, a coin flipping where its flip has it now. */
  readonly coins = computed<readonly TableWorldCoin[]>(() => {
    this.objectChange.collectionOf(Coin.aliasName)();
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.objectChange.fileVersion();
    this.transient.version();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const poses = this.motions.posesNow();
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
        backUp: poses.get(coin.identifier)?.backUp ?? coin.face === 'back',
        frontPictureUrl: this.images.getEmptyOr(coin.frontImage).url,
        backPictureUrl: this.images.getEmptyOr(coin.backImage).url,
      });
      const playing = poses.get(coin.identifier);
      if (drawn) coins.push(playing ? { ...drawn, motion: playing.pose } : drawn);
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

  /**
   * The characters this seat may see, drawn from their pictures and the pictures the page takes of
   * their pedestals: a character whose pedestal the page keeps to itself is drawn by the page.
   */
  private readonly characterSprites = computed(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.objectChange.fileVersion();
    this.objectChange.networkVersion();
    this.objectChange.trackMyCursor();
    this.transient.version();
    const table = this.tabletop.currentTableVersion();
    const gridSize = table.gridSize;
    const mode2d = this.tabletop.mode2d();
    const facesEye = this.tabletop.imageBillboard() || mode2d || this.eyes.scene() !== null;
    const fitsInCell = mode2d && this.roomRules.rulesFor(table).pieceImageInCell;
    const followed = this.eyes.followed();
    const lookedThrough = followed?.near ? followed.owner : '';
    this.objectChange.collectionOf(Terrain.aliasName)();
    const sprites: TableWorldSprite[] = [];
    for (const character of this.tabletop.characters) {
      this.objectChange.versionOf(character.identifier)();
      if (!this.vision.isTokenVisible(character)) continue;
      const place = this.placeOf(character);
      if (!place) continue;
      const model = pieceModelOf(character);
      const modelled = !!model && place.onFloor && this.modelUrlOf(model.identifier) !== '';
      const drawn = characterSprites({
        id: character.identifier,
        ...place,
        sizePx: Math.max(0, character.size) * gridSize,
        rotateDeg: character.rotate,
        rollDeg: character.roll,
        dropShadow: character.isDropShadow,
        lean: mode2d ? null : this.leanUnder(character, gridSize),
        altitudePx: character.altitude * gridSize,
        pedestal: this.pagePictures.pictureOf(character.identifier),
        picture: this.sized(this.images.getEmptyOr(character.imageFile).url),
        pictureHeightPx: character.specifyKomaImageFlag ? character.komaImageHeight : null,
        pictureWidthPx: character.specifyKomaImageFlag ? pieceImageWidthApart(character.komaImageWidth) : null,
        fitsInCell,
        facesEye,
        opacity: (character.stealth === '1' ? 0.5 : 1) * (lookedThrough === character.identifier ? SEEN_THROUGH : 1),
      });
      sprites.push(...(modelled ? drawn.map(standInForModel) : drawn));
    }
    return sprites;
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

  /**
   * The light sources, drawn from their own pictures where they have them and otherwise from the
   * picture the page takes of what marks them. The page shows a light's own picture as a background,
   * which a picture it takes of itself comes out without.
   */
  private readonly lightSprites = computed(() => {
    this.objectChange.collectionOf(LightSource.aliasName)();
    this.objectChange.fileVersion();
    this.transient.version();
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    const sprites: TableWorldSprite[] = [];
    for (const light of this.tabletop.lightSources) {
      this.objectChange.versionOf(light.identifier)();
      if (this.vision.isPieceHiddenByFog(light, 1)) continue;
      const place = this.placeOf(light);
      if (!place) continue;
      sprites.push(
        ...lightSourceSprites({
          id: light.identifier,
          ...place,
          altitudePx: light.altitude * gridSize,
          cellPx: gridSize,
          lit: light.lightEnabled,
          picture: this.ownPicture(light, gridSize) ?? this.pagePictures.pictureOf(light.identifier),
        })
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
          picture:
            this.pictured(card.identifier) ??
            this.sized(this.images.getSkeletonOr(card.isFront ? card.frontImage : card.backImage).url),
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
            ? {
                picture: this.pictured(stack.identifier) ?? this.sized(this.images.getSkeletonOr(stack.imageFile).url),
                rotateDeg: top.rotate,
              }
            : null,
          plateColour: plate,
        })
      );
    }
    return sprites;
  });

  /** How the ground under the middle of a piece leans, as the blocks it stands over lean, or null where it is level. */
  private leanUnder(piece: GameCharacter, gridSize: number): SurfaceLean | null {
    const middle = pieceCentreOffsetPx(piece, gridSize);
    const x = piece.location.x + middle;
    const y = piece.location.y + middle;
    const standingOn = this.tabletop.terrains.filter((terrain) => {
      const box = terrainBoxOf(terrain, gridSize);
      return box.minX <= x && x <= box.maxX && box.minY <= y && y <= box.maxY;
    });
    for (const terrain of standingOn) this.objectChange.versionOf(terrain.identifier)();
    return landingLeanAt(standingOn, gridSize, x, y, this.tabletop.currentTableVersion().gridType);
  }

  /** A light's own picture, held inside a cell keeping its shape as the page shows it, or null where it has none. */
  private ownPicture(light: LightSource, cellPx: number): PagePicture | null {
    const own = this.sized(this.images.getEmptyOr(light.imageFile).url);
    if (!own || !(own.width > 0) || !(own.height > 0)) return null;
    const scale = cellPx / Math.max(own.width, own.height);
    return { url: own.url, widthPx: own.width * scale, heightPx: own.height * scale };
  }

  /** A picture with how big it is, or null while that is not known. */
  private sized(url: string): SizedPicture | null {
    const size = url ? this.pictureSizes.sizeOf(url) : null;
    return size ? { url, ...size } : null;
  }

  /** The picture the page takes of a piece for the canvas, sized as a sprite's picture is, or null for none. */
  private pictured(identifier: string): SizedPicture | null {
    const picture = this.pagePictures.pictureOf(identifier);
    return picture ? { url: picture.url, width: picture.widthPx, height: picture.heightPx } : null;
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
    const facesEye = this.tabletop.imageBillboard() || this.tabletop.mode2d() || this.eyes.scene() !== null;
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
    const surface = this.surfaceOf(piece);
    const frame = this.surfaces.frameOf(surface);
    if (!frame) return null;
    const x = moving?.x ?? piece.location.x;
    const y = moving?.y ?? piece.location.y;
    const z = moving?.z ?? piece.posZ;
    const onFloor = surface === 'floor';
    return { frame, onFloor, x, y, z: onFloor ? z + this.groundLiftOf(piece, x, y, z) : z };
  }

  /**
   * How far the raised ground lifts a piece on the floor, in table pixels: as far as the block it stands
   * on is lifted, so it stays on the block's top, or else by the ground under its middle.
   */
  private groundLiftOf(piece: TabletopObject, x: number, y: number, z: number): number {
    const ground = this.ground.surface();
    if (ground.isFlat) return 0;
    const table = this.tabletop.currentTableVersion();
    const gridSize = table.gridSize > 0 ? table.gridSize : 50;
    const size = Number((piece as { size?: unknown }).size);
    const half = size > 0 ? (size * gridSize) / 2 : 0;
    const [middleX, middleY] = [x + half, y + half];
    for (const terrain of this.tabletop.terrains) {
      if (!canBeStoodOn(terrain) || !terrainCovers(terrain, gridSize, middleX, middleY)) continue;
      const top = terrainTopPxAt(terrain, gridSize, table.gridType, middleX, middleY);
      if (Math.abs(top - z) < 1) return groundLiftOfBlock(ground, gridSize, terrain);
    }
    return ground.heightAt(middleX / gridSize, middleY / gridSize) * gridSize;
  }

  /**
   * The face a piece is drawn on, as a location names it: the one this seat is moving it on, or the
   * one it stands on. A piece on a wall the table does not draw, or on a board no longer there, is
   * drawn on the floor.
   */
  surfaceOf(piece: TabletopObject): string {
    const named = this.transient.placementOf(piece.identifier)?.surface ?? (boardSurfaceOf(piece) || surfaceOf(piece));
    const board = this.objectStore.get(named);
    if (board instanceof WhiteBoard) this.objectChange.versionOf(board.identifier)();
    return board instanceof WhiteBoard || this.drawnWalls().has(named) ? named : 'floor';
  }

  /**
   * Where a piece drawn on the table turns about: the middle of the first of its sprites lying on
   * its face, on the face it is drawn on, in the face's own pixels, and how far off the face that
   * lies. Null for a piece not drawn, or drawn with nothing lying on its face.
   */
  turnAboutOf(piece: TabletopObject): { surface: string; x: number; y: number; height: number } | null {
    const lying = untracked(this.sprites).find(
      (sprite) => sprite.owner === piece.identifier && sprite.order !== undefined && sprite.facing !== 'eye'
    );
    const surface = this.surfaceOf(piece);
    const frame = this.surfaces.frameOf(surface);
    if (!lying || !frame) return null;
    const from = {
      x: lying.centre.x - frame.origin.x,
      y: lying.centre.y - frame.origin.y,
      z: lying.centre.z - frame.origin.z,
    };
    const along = (axis: { x: number; y: number; z: number }) => from.x * axis.x + from.y * axis.y + from.z * axis.z;
    return { surface, x: along(frame.u), y: along(frame.v), height: along(frame.normal) };
  }

  /**
   * Where a character drawn on the table is tipped over about when it is rolled, as its picture is
   * drawn: on the table, in table pixels. Null for one not drawn, or on a wall or a board.
   */
  rollPivotOf(character: GameCharacter): { x: number; y: number; z: number } | null {
    const place = untracked(() => this.placeOf(character));
    if (!place) return null;
    const gridSize = untracked(this.tabletop.currentTableVersion).gridSize;
    return characterRollPivot({
      ...place,
      sizePx: Math.max(0, character.size) * gridSize,
      altitudePx: character.altitude * gridSize,
    });
  }

  /** A colour of the theme on screen, as the page names it, or the colour given where it cannot be read. */
  private themeColour(property: string, otherwise: string): string {
    if (typeof getComputedStyle !== 'function') return otherwise;
    const colour = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    return colour || otherwise;
  }
}

/** How many times its footprint a character drawn as a model stands at the most, as a picture of a figure does. */
const CHARACTER_MODEL_HEIGHT_CELLS = 2;

/**
 * A sprite of a character drawn as a 3D model: its picture and its shadow left undrawn, still picked
 * where they stand, and its pedestal drawn as it is.
 */
function standInForModel(sprite: TableWorldSprite): TableWorldSprite {
  return sprite.id.endsWith('#pedestal') ? sprite : { ...sprite, hidden: true };
}
