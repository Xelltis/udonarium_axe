import { computed, inject, Injectable, type Signal, untracked } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceMotionsService, type PlayingPose } from '@axe/application/tabletop/piece-motions.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import {
  type TransientPlacement,
  TransientPlacementService,
} from '@axe/application/tabletop/transient-placement.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { sameFields } from '@axe/core/util/same-fields';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { pieceImageWidthApart } from '@axe/domain/character/piece-image-size';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { groundLiftOfBlock } from '@axe/domain/tabletop/ground/ground-surface';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { canBeStoodOn } from '@axe/domain/tabletop/move/landing-height';
import { landingLeanAt } from '@axe/domain/tabletop/move/landing-height';
import { pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';
import { pieceModelOf } from '@axe/domain/tabletop/piece-model';
import { RangeArea } from '@axe/domain/tabletop/range';
import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { asTableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { tableWallSettings } from '@axe/domain/tabletop/table-walls';
import { boardSurfaceOf, surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainCovers } from '@axe/domain/tabletop/terrain-box';
import { type TerrainBox, terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
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
import { characterModelBox, type TableWorldModel } from '@axe/domain/tabletop/world/table-models';
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

/** A piece drawn where it stands, on the face it stands on, with how to draw it again elsewhere. */
interface StandingPiece<T> {
  /** The face it is drawn on, as a location names it. */
  readonly surface: string;
  readonly parts: readonly T[];
  /**
   * Draws the piece again where this seat moves it, or, given null, where it stands on a board this
   * seat moves, which takes it along.
   */
  readonly again: (moving: TransientPlacement | null) => readonly T[];
}

/**
 * The pieces of a kind drawn where each stands, in the order they are drawn in, with which of them
 * stand on each face other than the floor.
 */
interface StandingParts<T> {
  readonly owners: readonly string[];
  readonly pieces: ReadonlyMap<string, StandingPiece<T>>;
  /** The pieces standing on each face other than the floor, by the face's name. */
  readonly riders: ReadonlyMap<string, readonly string[]>;
  /** Every part, in order, as the pieces stand. */
  readonly all: readonly T[];
}

/**
 * How each piece of a kind is drawn: what all of them are drawn with alike, whether one is drawn at
 * all, and its parts at a place.
 */
interface PieceDrawing<P extends TabletopObject, T, L> {
  /**
   * What every piece of the kind is drawn with, read for each piece on its own, so that each is drawn
   * again when what it reads changes.
   */
  readonly look: () => L;
  readonly shown: (piece: P, look: L) => boolean;
  readonly draw: (piece: P, place: DrawnPlace, moving: boolean, look: L) => readonly T[];
}

/**
 * The shape of the table in view, which says where the faces pieces stand on are: how big a cell is,
 * how the cells are laid, and how far the floor and the walls run, in cells.
 */
interface TableShape {
  readonly gridSize: number;
  readonly gridType: GameTable['gridType'];
  readonly width: number;
  readonly height: number;
  readonly wallHeight: number;
}

/** A block on the table in view with the box its footprint fills, as the floor's axes have it. */
interface PlacedBlock {
  readonly terrain: Terrain;
  readonly box: TerrainBox;
}

/** What most kinds of piece are drawn with alike: how big a cell is. */
interface GridLook {
  readonly gridSize: number;
}

/** What every coin is drawn with alike: how big a cell is, and how the coins playing a move lie now. */
interface CoinLook extends GridLook {
  readonly poses: ReadonlyMap<string, PlayingPose>;
}

/** What every character is drawn with alike, as the table in view shows the pictures of pieces. */
interface CharacterLook extends GridLook {
  readonly mode2d: boolean;
  readonly facesEye: boolean;
  readonly fitsInCell: boolean;
  readonly turnsWithPiece: boolean;
  /** The character the table's camera looks through, or nothing. */
  readonly lookedThrough: string;
}

/** What every card and stack of cards is drawn with alike. */
interface CardLook extends GridLook {
  readonly thick: boolean;
  readonly plate: string;
}

/** What every die is drawn with alike. */
interface DiceLook extends GridLook {
  readonly facesEye: boolean;
  /** Whether this seat may read the faces of the dice kept back from it. */
  readonly seesHidden: boolean;
  /** The colour of the frame of a die that is somebody's. */
  readonly owned: string;
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
  private readonly ground = inject(StandingGroundService);
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
  readonly models = computed<readonly TableWorldModel[]>(() => this.drawnNow(this.standingModels()));

  private readonly standingModels = computed<StandingParts<TableWorldModel>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return this.modelDrawing(this.tabletop.characters);
  });

  private readonly modelDrawing = this.drawingOf<GameCharacter, TableWorldModel, GridLook>({
    look: () => {
      this.objectChange.fileVersion();
      return this.gridLook();
    },
    shown: (character) => {
      const model = pieceModelOf(character);
      return !!model && this.modelUrlOf(model.identifier) !== '' && this.vision.isTokenVisible(character);
    },
    draw: (character, place, moving, { gridSize }) => {
      const model = pieceModelOf(character);
      const url = model ? this.modelUrlOf(model.identifier) : '';
      if (!model || !url || !place.onFloor) return [];
      const size = Math.max(0, character.size) * gridSize;
      const box = characterModelBox(
        size,
        character.specifyKomaImageFlag ? character.komaImageHeight : null,
        character.specifyKomaImageFlag ? pieceImageWidthApart(character.komaImageWidth) : null
      );
      return [
        {
          owner: character.identifier,
          kind: GameCharacter.aliasName,
          url,
          model,
          foot: { x: place.x + size / 2, y: place.y + size / 2, z: place.z },
          footprintPx: box.widthPx,
          heightPx: box.heightPx,
          rotateDeg: character.rotate,
          rollDeg: character.roll,
          pivotPx: size / 2,
          altitudePx: character.altitude * gridSize,
          walking: moving,
        },
      ];
    },
  });

  /** How big a cell of the table in view is, which most kinds of piece are drawn with alike. */
  private readonly gridLook = computed<GridLook>(() => ({ gridSize: this.tableShape().gridSize }), {
    equal: sameFields,
  });

  /**
   * The shape of the table in view, which every piece is drawn by, kept as it was while the table
   * changes otherwise, as when a block, a board or a light on it moves.
   */
  private readonly tableShape = computed<TableShape>(
    () => {
      const table = this.tabletop.currentTableVersion();
      return {
        gridSize: table.gridSize,
        gridType: table.gridType,
        width: table.width,
        height: table.height,
        wallHeight: table.wallHeight,
      };
    },
    { equal: sameFields }
  );

  /** Which table is in view, by its identifier, for the pieces of each kind to be listed afresh on another. */
  private readonly tableInView = computed(() => this.tabletop.currentTableVersion().identifier);

  /**
   * The blocks on the table in view, each with the box its footprint fills, kept as they were while
   * no block comes, goes or moves its footprint: a door opening changes none of it. What stands on a
   * block follows that block itself for the rest.
   */
  private readonly blocks = computed<readonly PlacedBlock[]>(
    () => {
      this.tableInView();
      this.objectChange.collectionOf(Terrain.aliasName)();
      const gridSize = this.tableShape().gridSize;
      return this.tabletop.terrains.map((terrain) => {
        this.objectChange.versionOf(terrain.identifier)();
        return { terrain, box: terrainBoxOf(terrain, gridSize) };
      });
    },
    {
      equal: (a, b) =>
        a.length === b.length &&
        a.every((placed, at) => placed.terrain === b[at].terrain && sameFields(placed.box, b[at].box)),
    }
  );

  /** The blocks whose footprint's box holds a point of the floor, each followed from then on. */
  private blocksOver(x: number, y: number): Terrain[] {
    const over: Terrain[] = [];
    for (const { terrain, box } of this.blocks()) {
      if (box.minX > x || x > box.maxX || box.minY > y || y > box.maxY) continue;
      this.objectChange.versionOf(terrain.identifier)();
      over.push(terrain);
    }
    return over;
  }

  /** Who this seat is, by its user's identifier, which the pieces it owns or holds are told by. */
  private readonly myUserId = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myUserId;
  });

  /** The models the characters on the table in view are drawn as that are not held here in full yet. */
  readonly missingModels = computed<readonly string[]>(
    () => {
      this.objectChange.collectionOf(GameCharacter.aliasName)();
      this.objectChange.fileVersion();
      const missing = new Set<string>();
      for (const character of this.tabletop.characters) {
        this.objectChange.versionOf(character.identifier)();
        const model = pieceModelOf(character);
        if (model && !this.modelUrlOf(model.identifier)) missing.add(model.identifier);
      }
      return [...missing];
    },
    { equal: (a, b) => a.length === b.length && a.every((identifier, i) => identifier === b[i]) }
  );

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
  readonly coins = computed<readonly TableWorldCoin[]>(() => this.drawnNow(this.standingCoins()));

  private readonly standingCoins = computed<StandingParts<TableWorldCoin>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(Coin.aliasName)();
    return this.coinDrawing(this.tabletop.coins);
  });

  /**
   * How big a cell is, and how the coins playing a move lie now: only the coins', so that what another
   * piece plays draws no coin again.
   */
  private readonly coinLook = computed<CoinLook>(
    () => {
      this.objectChange.collectionOf(Coin.aliasName)();
      const playing = this.motions.posesNow();
      const poses = new Map<string, PlayingPose>();
      for (const coin of this.tabletop.coins) {
        const pose = playing.get(coin.identifier);
        if (pose) poses.set(coin.identifier, pose);
      }
      return { gridSize: this.gridLook().gridSize, poses };
    },
    {
      equal: (a, b) =>
        a.gridSize === b.gridSize &&
        a.poses.size === b.poses.size &&
        [...a.poses].every(([coin, pose]) => b.poses.get(coin) === pose),
    }
  );

  private readonly coinDrawing = this.drawingOf<Coin, TableWorldCoin, CoinLook>({
    look: () => {
      this.objectChange.collectionOf(WhiteBoard.aliasName)();
      this.objectChange.fileVersion();
      return this.coinLook();
    },
    shown: (coin) => !this.vision.isPieceHiddenByFog(coin, coinSizeOf(coin)),
    draw: (coin, place, _moving, { gridSize, poses }) => {
      const drawn = tableCoinOf({
        id: coin.identifier,
        ...place,
        sizePx: coinSizeOf(coin) * gridSize,
        rotateDeg: coin.rotate,
        backUp: poses.get(coin.identifier)?.backUp ?? coin.face === 'back',
        frontPictureUrl: this.images.getEmptyOr(coin.frontImage).url,
        backPictureUrl: this.images.getEmptyOr(coin.backImage).url,
      });
      const playing = poses.get(coin.identifier);
      if (!drawn) return [];
      return [playing ? { ...drawn, motion: playing.pose } : drawn];
    },
  });

  /** The walls drawn on the table in view, which are drawn only with a picture. */
  private readonly drawnWalls = computed<ReadonlySet<string>>(
    () => {
      this.objectChange.fileVersion();
      return new Set(
        tableWallSettings(this.tabletop.currentTableVersion())
          .filter((wall) => wall.shown && this.images.getEmptyOr(wall.imageIdentifier).url)
          .map((wall) => wall.surface)
      );
    },
    { equal: (a, b) => a.size === b.size && [...a].every((wall) => b.has(wall)) }
  );

  /**
   * The characters this seat may see, drawn from their pictures and the pictures the page takes of
   * their pedestals: a character whose pedestal the page keeps to itself is drawn by the page.
   */
  private readonly characterSprites = computed(() => this.drawnNow(this.standingCharacters()));

  private readonly standingCharacters = computed<StandingParts<TableWorldSprite>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return this.characterDrawing(this.tabletop.characters);
  });

  private readonly characterLook = computed<CharacterLook>(
    () => {
      const table = this.tabletop.currentTableVersion();
      const mode2d = this.tabletop.mode2d();
      this.objectChange.versionOf('Config')();
      const rules = this.roomRules.rulesFor(table);
      const followed = this.eyes.followed();
      return {
        gridSize: table.gridSize,
        mode2d,
        facesEye: this.tabletop.imageBillboard() || mode2d || this.eyes.scene() !== null,
        fitsInCell: mode2d && rules.pieceImageInCell,
        turnsWithPiece:
          mode2d && !this.tabletop.display().multiAngleEnabled && asTableFacingMark(rules.facingMark) === 'turn',
        lookedThrough: followed?.near ? followed.owner : '',
      };
    },
    { equal: sameFields }
  );

  private readonly characterDrawing = this.drawingOf<GameCharacter, TableWorldSprite, CharacterLook>({
    look: () => {
      this.objectChange.collectionOf(WhiteBoard.aliasName)();
      this.objectChange.collectionOf(Terrain.aliasName)();
      this.objectChange.fileVersion();
      this.objectChange.networkVersion();
      this.myUserId();
      return this.characterLook();
    },
    shown: (character) => this.vision.isTokenVisible(character),
    draw: (character, place, _moving, look) => {
      const model = pieceModelOf(character);
      const modelled = !!model && place.onFloor && this.modelUrlOf(model.identifier) !== '';
      const drawn = characterSprites({
        id: character.identifier,
        ...place,
        sizePx: Math.max(0, character.size) * look.gridSize,
        rotateDeg: character.rotate,
        rollDeg: character.roll,
        dropShadow: character.isDropShadow,
        lean: look.mode2d ? null : this.leanUnder(character, look.gridSize),
        altitudePx: character.altitude * look.gridSize,
        pedestal: this.pagePictures.pictureOf(character.identifier),
        picture: this.sized(this.images.getEmptyOr(character.imageFile).url),
        pictureHeightPx: character.specifyKomaImageFlag ? character.komaImageHeight : null,
        pictureWidthPx: character.specifyKomaImageFlag ? pieceImageWidthApart(character.komaImageWidth) : null,
        fitsInCell: look.fitsInCell,
        facesEye: look.facesEye,
        turnsWithPiece: look.turnsWithPiece,
        opacity:
          (character.stealth === '1' ? 0.5 : 1) * (look.lookedThrough === character.identifier ? SEEN_THROUGH : 1),
      });
      return modelled ? drawn.map(standInForModel) : drawn;
    },
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
  private readonly lightSprites = computed(() => this.drawnNow(this.standingLights()));

  private readonly standingLights = computed<StandingParts<TableWorldSprite>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(LightSource.aliasName)();
    return this.lightDrawing(this.tabletop.lightSources);
  });

  private readonly lightDrawing = this.drawingOf<LightSource, TableWorldSprite, GridLook>({
    look: () => {
      this.objectChange.fileVersion();
      return this.gridLook();
    },
    shown: (light) => !this.vision.isPieceHiddenByFog(light, 1),
    draw: (light, place, _moving, { gridSize }) =>
      lightSourceSprites({
        id: light.identifier,
        ...place,
        altitudePx: light.altitude * gridSize,
        cellPx: gridSize,
        lit: light.lightEnabled,
        picture: this.ownPicture(light, gridSize) ?? this.pagePictures.pictureOf(light.identifier),
      }),
  });

  /** The map masks, drawn from the pictures the page takes of them cut to their open cells. */
  private readonly maskSprites = computed(() => this.drawnNow(this.standingMasks()));

  private readonly standingMasks = computed<StandingParts<TableWorldSprite>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(GameTableMask.aliasName)();
    return this.maskDrawing(this.tabletop.tableMasks);
  });

  private readonly maskDrawing = this.drawingOf<GameTableMask, TableWorldSprite, GridLook>({
    look: () => this.gridLook(),
    shown: () => true,
    draw: (mask, place, _moving, { gridSize }) =>
      maskSprites({
        id: mask.identifier,
        ...place,
        altitudePx: mask.altitude * gridSize,
        picture: this.pagePictures.pictureOf(mask.identifier),
      }),
  });

  /** The ranges, drawn from the pictures the page takes of their cells. */
  private readonly rangeSprites = computed(() => this.drawnNow(this.standingRanges()));

  private readonly standingRanges = computed<StandingParts<TableWorldSprite>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(RangeArea.aliasName)();
    return this.rangeDrawing(this.tabletop.ranges);
  });

  private readonly rangeDrawing = this.drawingOf<RangeArea, TableWorldSprite, GridLook>({
    look: () => this.gridLook(),
    shown: () => true,
    draw: (range, place, _moving, { gridSize }) =>
      rangeSprites({
        id: range.identifier,
        ...place,
        altitudePx: range.altitude * gridSize,
        picture: this.pagePictures.pictureOf(range.identifier),
      }),
  });

  /** The notes, drawn from the pictures the page takes of their panels. */
  private readonly noteSprites = computed(() => this.drawnNow(this.standingNotes()));

  private readonly standingNotes = computed<StandingParts<TableWorldSprite>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(TextNote.aliasName)();
    return this.noteDrawing(this.tabletop.textNotes);
  });

  private readonly noteDrawing = this.drawingOf<TextNote, TableWorldSprite, GridLook>({
    look: () => {
      this.objectChange.collectionOf(WhiteBoard.aliasName)();
      return this.gridLook();
    },
    shown: (note) => !this.vision.isPieceHiddenByFog(note, 1),
    draw: (note, place, _moving, { gridSize }) =>
      textNoteSprites({
        id: note.identifier,
        ...place,
        altitudePx: note.altitude * gridSize,
        rotateDeg: note.rotate,
        upright: note.isUpright,
        face: this.pagePictures.pictureOf(note.identifier),
      }),
  });

  private readonly cardSprites = computed(() => this.drawnNow(this.standingCards()));

  private readonly standingCards = computed<StandingParts<TableWorldSprite>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(Card.aliasName)();
    this.objectChange.collectionOf(CardStack.aliasName)();
    return this.bothStanding(this.cardDrawing(this.tabletop.cards), this.stackDrawing(this.tabletop.cardStacks));
  });

  private readonly cardLook = computed<CardLook>(
    () => {
      this.theme.resolved();
      return {
        gridSize: this.tabletop.currentTableVersion().gridSize,
        thick: !this.tabletop.mode2d(),
        plate: this.themeColour(STACK_PLATE_COLOUR_PROPERTY, STACK_PLATE_COLOUR),
      };
    },
    { equal: sameFields }
  );

  private readonly cardDrawing = this.drawingOf<Card, TableWorldSprite, CardLook>({
    look: () => this.cardsLook(),
    shown: (card) => !this.vision.isPieceHiddenByFog(card, Math.max(0, card.size)),
    draw: (card, place, _moving, { gridSize }) =>
      cardSprites({
        id: card.identifier,
        ...place,
        zindex: card.zindex,
        rotateDeg: card.rotate,
        widthPx: Math.max(0, card.size) * gridSize,
        picture:
          this.pictured(card.identifier) ??
          this.sized(this.images.getSkeletonOr(card.isFront ? card.frontImage : card.backImage).url),
        peek: card.isPeeking ? this.sized(this.images.getSkeletonOr(card.frontImage).url) : null,
      }),
  });

  private readonly stackDrawing = this.drawingOf<CardStack, TableWorldSprite, CardLook>({
    look: () => this.cardsLook(),
    shown: (stack) => !this.vision.isPieceHiddenByFog(stack, stackSizeOf(stack)),
    draw: (stack, place, _moving, { gridSize, thick, plate }) => {
      const top = stack.topCard;
      return cardStackSprites({
        id: stack.identifier,
        ...place,
        zindex: stack.zindex,
        rotateDeg: stack.rotate,
        widthPx: stackSizeOf(stack) * gridSize,
        cardCount: stack.cards.length,
        thick: thick && surfaceOf(stack) === 'floor',
        top: top
          ? {
              picture: this.pictured(stack.identifier) ?? this.sized(this.images.getSkeletonOr(stack.imageFile).url),
              rotateDeg: top.rotate,
            }
          : null,
        plateColour: plate,
      });
    },
  });

  /** What a card or a stack of cards is drawn with, following the boards, the files held here and who may see what. */
  private cardsLook(): CardLook {
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    this.objectChange.fileVersion();
    this.objectChange.networkVersion();
    this.myUserId();
    return this.cardLook();
  }

  /** How the ground under the middle of a piece leans, as the blocks it stands over lean, or null where it is level. */
  private leanUnder(piece: GameCharacter, gridSize: number): SurfaceLean | null {
    const middle = pieceCentreOffsetPx(piece, gridSize);
    const x = piece.location.x + middle;
    const y = piece.location.y + middle;
    return landingLeanAt(this.blocksOver(x, y), gridSize, x, y, this.tableShape().gridType);
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

  private readonly diceSprites = computed(() => this.drawnNow(this.standingDice()));

  private readonly standingDice = computed<StandingParts<TableWorldSprite>>(() => {
    this.tableInView();
    this.objectChange.collectionOf(DiceSymbol.aliasName)();
    return this.diceDrawing(this.tabletop.diceSymbols);
  });

  private readonly diceLook = computed<DiceLook>(
    () => {
      this.theme.resolved();
      return {
        gridSize: this.tabletop.currentTableVersion().gridSize,
        facesEye: this.tabletop.imageBillboard() || this.tabletop.mode2d() || this.eyes.scene() !== null,
        owned: this.themeColour(OWNED_FRAME_COLOUR_PROPERTY, DICE_FRAME_COLOUR),
        seesHidden: this.rolePermission.canSeeHidden(),
      };
    },
    { equal: sameFields }
  );

  private readonly diceDrawing = this.drawingOf<DiceSymbol, TableWorldSprite, DiceLook>({
    look: () => {
      this.objectChange.collectionOf(WhiteBoard.aliasName)();
      this.objectChange.fileVersion();
      this.objectChange.networkVersion();
      this.myUserId();
      return this.diceLook();
    },
    shown: (die) => !this.vision.isPieceHiddenByFog(die, Math.max(0, die.size)),
    draw: (die, place, _moving, { gridSize, facesEye, owned, seesHidden }) => {
      const url = this.images.getEmptyOr(die.imageFile).url;
      const picture = url ? this.pictureSizes.sizeOf(url) : null;
      const reads = die.isVisible || seesHidden;
      return diceSymbolSprites({
        id: die.identifier,
        ...place,
        sizePx: Math.max(0, die.size) * gridSize,
        rotateDeg: die.rotate,
        picture: picture ? { url, ...picture } : null,
        pictureHeightPx: die.specifyKomaImageFlag ? +die.komaImageHeight : null,
        facesEye,
        pictureBrightness: !reads ? 0 : die.isMine ? 0.5 : die.isUsed ? 0.45 : 1,
        frameBrightness: die.isUsed ? 0.45 : 1,
        frameColour: die.hasOwner ? owned : DICE_FRAME_COLOUR,
      });
    },
  });

  /**
   * How to draw the pieces of a kind where each stands: each piece once, and again only when it or
   * what it reads changes, so that a piece another seat drags is drawn again alone. Nothing here
   * reads what this seat is moving, so its own drags draw none of it again.
   */
  private drawingOf<P extends TabletopObject, T, L>(
    drawing: PieceDrawing<P, T, L>
  ): (pieces: readonly P[]) => StandingParts<T> {
    let drawn = new Map<P, Signal<StandingPiece<T> | null>>();
    return (pieces) => {
      const kept = new Map<P, Signal<StandingPiece<T> | null>>();
      const owners: string[] = [];
      const standing = new Map<string, StandingPiece<T>>();
      const riders = new Map<string, string[]>();
      const all: T[] = [];
      for (const piece of pieces) {
        const one = drawn.get(piece) ?? this.pieceDrawn(piece, drawing);
        kept.set(piece, one);
        const now = one();
        if (!now) continue;
        owners.push(piece.identifier);
        standing.set(piece.identifier, now);
        all.push(...now.parts);
        if (now.surface === 'floor') continue;
        const riding = riders.get(now.surface);
        if (riding) riding.push(piece.identifier);
        else riders.set(now.surface, [piece.identifier]);
      }
      drawn = kept;
      return { owners, pieces: standing, riders, all };
    };
  }

  /**
   * A piece drawn where it stands, as it is drawn now, or null for one not drawn. It follows the shape
   * of the table in view, which says where the faces it may stand on are, and whether it is shown,
   * which is worked out on its own, so that what the seat sees changing elsewhere draws it again only
   * where it comes into view or goes out of it.
   */
  private pieceDrawn<P extends TabletopObject, T, L>(
    piece: P,
    drawing: PieceDrawing<P, T, L>
  ): Signal<StandingPiece<T> | null> {
    const shown = computed(() => {
      const look = drawing.look();
      this.objectChange.versionOf(piece.identifier)();
      return drawing.shown(piece, look);
    });
    return computed(() => {
      this.tableShape();
      const look = drawing.look();
      this.objectChange.versionOf(piece.identifier)();
      if (!shown()) return null;
      const surface = this.surfaceOn(piece, null);
      const place = this.placeOn(piece, surface, null);
      if (!place) return null;
      return {
        surface,
        parts: drawing.draw(piece, place, false, look),
        again: (moving) => {
          const moved = this.placeOf(piece, moving);
          return moved ? drawing.draw(piece, moved, moving !== null, look) : [];
        },
      };
    });
  }

  /** Two kinds of piece drawn one after the other, as one. */
  private bothStanding<T>(first: StandingParts<T>, second: StandingParts<T>): StandingParts<T> {
    const riders = new Map<string, readonly string[]>(first.riders);
    for (const [surface, riding] of second.riders) riders.set(surface, [...(riders.get(surface) ?? []), ...riding]);
    return {
      owners: [...first.owners, ...second.owners],
      pieces: new Map([...first.pieces, ...second.pieces]),
      riders,
      all: [...first.all, ...second.all],
    };
  }

  /**
   * The parts of a kind of piece as this seat draws them: where each stands, but each piece this seat
   * is moving drawn again where it moves it, and each standing on a board it moves drawn again on the
   * board where it is. Where it moves none of them, the parts as they stand.
   */
  private drawnNow<T>(standing: StandingParts<T>): readonly T[] {
    const placed = this.transient.placed();
    const again = new Set<string>();
    for (const owner of placed.keys()) {
      if (standing.pieces.has(owner)) again.add(owner);
      for (const riding of standing.riders.get(owner) ?? []) again.add(riding);
    }
    if (again.size === 0) return standing.all;
    const drawn: T[] = [];
    for (const owner of standing.owners) {
      const piece = standing.pieces.get(owner)!;
      drawn.push(...(again.has(owner) ? piece.again(placed.get(owner) ?? null) : piece.parts));
    }
    return drawn;
  }

  /**
   * Where a piece is drawn: where this seat is moving it, as `moving` says, or where it stands. A
   * piece on a wall the table does not draw, or on a board no longer there, is drawn on the floor, as
   * the page draws it.
   */
  private placeOf(piece: TabletopObject, moving: TransientPlacement | null): DrawnPlace | null {
    return this.placeOn(piece, this.surfaceOn(piece, moving), moving);
  }

  /** Where a piece is drawn on the face given, which is the one it is drawn on; see {@link placeOf}. */
  private placeOn(piece: TabletopObject, surface: string, moving: TransientPlacement | null): DrawnPlace | null {
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
    const table = this.tableShape();
    const gridSize = table.gridSize > 0 ? table.gridSize : 50;
    const size = Number((piece as { size?: unknown }).size);
    const half = size > 0 ? (size * gridSize) / 2 : 0;
    const [middleX, middleY] = [x + half, y + half];
    for (const terrain of this.blocksOver(middleX, middleY)) {
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
    return this.surfaceOn(piece, this.transient.placementOf(piece.identifier));
  }

  /** The face a piece is drawn on, where this seat moves it as `moving` says; see {@link surfaceOf}. */
  private surfaceOn(piece: TabletopObject, moving: TransientPlacement | null): string {
    const named = moving?.surface ?? (boardSurfaceOf(piece) || surfaceOf(piece));
    if (named === 'floor') return named;
    this.objectChange.collectionOf(WhiteBoard.aliasName)();
    const board = this.objectStore.get(named);
    if (board instanceof WhiteBoard) this.objectChange.versionOf(board.identifier)();
    return board instanceof WhiteBoard || this.drawnWalls().has(named) ? named : 'floor';
  }

  /**
   * Where a piece drawn on the table stands: the point of the face it is drawn on that its place
   * is at, in the face's own pixels, and how far off the face that is, lifted onto the ground under
   * it on the floor and following it while this seat moves it. A piece on no face the table draws
   * stands where it is kept.
   */
  footOf(piece: TabletopObject): { surface: string; x: number; y: number; height: number } {
    const moving = this.transient.placementOf(piece.identifier);
    const surface = this.surfaceOn(piece, moving);
    const place = this.placeOn(piece, surface, moving);
    return place
      ? { surface, x: place.x, y: place.y, height: place.z }
      : { surface, x: piece.location.x, y: piece.location.y, height: piece.posZ };
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
    const place = untracked(() => this.placeOf(character, this.transient.placementOf(character.identifier)));
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

/**
 * A sprite of a character drawn as a 3D model: its picture and its shadow left undrawn, still picked
 * where they stand, and its pedestal drawn as it is.
 */
function standInForModel(sprite: TableWorldSprite): TableWorldSprite {
  return sprite.id.endsWith('#pedestal') ? sprite : { ...sprite, hidden: true };
}

/** How many cells across a coin is drawn, one of no size as one. */
function coinSizeOf(coin: Coin): number {
  return coin.size > 0 ? coin.size : 1;
}

/** How many cells across a stack of cards is drawn, as its top card is, or two while it has none. */
function stackSizeOf(stack: CardStack): number {
  return stack.topCard?.size ?? 2;
}
