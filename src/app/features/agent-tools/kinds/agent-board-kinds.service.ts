import { inject, Injectable } from '@angular/core';
import { type AgentSquare, AgentViews } from '@axe/application/agent/agent-views.service';
import { PieceNameService } from '@axe/application/character/piece-name.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { DoorService } from '@axe/application/tabletop/door.service';
import { PlacedRulerService } from '@axe/application/tabletop/placed-ruler.service';
import { RulerReadingService } from '@axe/application/tabletop/ruler-reading.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TableAmbienceService } from '@axe/application/tabletop/table-ambience.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { WhiteBoardService } from '@axe/application/tabletop/white-board.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { AgentObjectSchema, AgentSchema } from '@axe/core/agent/agent-schema';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp, clamp01 } from '@axe/core/util/clamp';
import { GameCharacter } from '@axe/domain/character/game-character';
import { AMBIENCE_BRIGHTNESS, type AmbienceBrightness } from '@axe/domain/effect/ambience/ambience-brightness';
import { type AmbienceKind, GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import { EffectField } from '@axe/domain/effect/effect-field';
import { canBrowseImage, ImageTag } from '@axe/domain/media/image-tag';
import { isAccountAvatar } from '@axe/domain/peer/account-avatar';
import {
  MAX_BACKGROUND_LAYER_SCALE,
  MAX_BACKGROUND_SCROLL_SPEED,
  MIN_BACKGROUND_LAYER_SCALE,
} from '@axe/domain/tabletop/background-scroll';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { MAX_MODEL_SCALE, MIN_MODEL_SCALE, modelScaleOf, modelTurnOf } from '@axe/domain/tabletop/piece-model';
import type { RulerEnd, RulerLine } from '@axe/domain/tabletop/ruler/ruler-line';
import { SHOWN_TO, type ShownTo } from '@axe/domain/tabletop/shown-to';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import {
  asTableLayerPlacement,
  MAX_TABLE_BACKGROUND_LAYERS,
  moveBackgroundLayer,
  TABLE_LAYER_PLACEMENTS,
  TableBackgroundLayer,
  type TableLayerPlacement,
} from '@axe/domain/tabletop/table-background-layer';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  DoorStyle,
  Terrain,
  TERRAIN_IMAGE_SLOTS,
  type TerrainImageSlot,
  TerrainViewState,
} from '@axe/domain/tabletop/terrain';
import { drawnSlopeSides, gridSlopeSides, type SlopeSide, slopeSidesOn } from '@axe/domain/tabletop/terrain-slope';
import { applyLightPreset, LightAnimation, LightCategory, LightPreset } from '@axe/domain/tabletop/vision-types';
import { MAX_SURFACE_CELLS } from '@axe/domain/tabletop/water/water-surface';
import {
  clampBoardPitch,
  MAX_BOARD_PITCH,
  setBoardHeightKeepingFoot,
  WhiteBoard,
} from '@axe/domain/tabletop/white-board';
import { findOne } from '@axe/features/agent-tools/agent-lookup';
import {
  type AgentArgs,
  type AgentKind,
  type AgentKindField,
  type AnyAgentKind,
  anyKind,
  choiceField,
  flagField,
  numberField,
  objectInput,
  textField,
} from '@axe/features/agent-tools/kinds/agent-kind';
import { AgentSquares, SQUARE_SCHEMA } from '@axe/features/agent-tools/kinds/agent-squares.service';

/** The square a new thing is laid in, as the options of making one take it. */
const AT: AgentSchema = {
  ...SQUARE_SCHEMA,
  description: 'The square to lay its north-west corner in. Leave out for the middle of the table.',
};

/** One end of a ruler, as the AI gives and is given it. */
const RULER_END: AgentObjectSchema = {
  type: 'object',
  description:
    'One end of the ruler: in a square, or held to a piece and following it as it moves. Give a square or a piece.',
  properties: {
    square: SQUARE_SCHEMA,
    piece: { type: 'string', maxLength: 200, description: 'The id or name of a piece this seat sees.' },
    height: {
      type: 'number',
      minimum: -100,
      maximum: 100,
      description: "How many squares above the ground (or above the piece's feet) the end is; 0 where left out.",
    },
  },
  additionalProperties: false,
};

/** A ruler's two ends, as the AI gives and is given them. */
const RULER_LINE: AgentObjectSchema = {
  type: 'object',
  description: 'The two ends of the ruler.',
  properties: { from: RULER_END, to: RULER_END },
  required: ['from', 'to'],
  additionalProperties: false,
};

/** A colour as the screen's pickers write one. */
const COLOUR = /^#[0-9a-f]{6}$/i;

/** Which faces of a block are drawn, by the words the AI writes them in. */
const DRAWS: Readonly<Record<string, TerrainViewState>> = {
  none: TerrainViewState.NULL,
  floor: TerrainViewState.FLOOR,
  wall: TerrainViewState.WALL,
  all: TerrainViewState.ALL,
};

const DOOR_STYLES = [DoorStyle.NONE, DoorStyle.SWING, DoorStyle.SLIDE, DoorStyle.LIFT, DoorStyle.SINK] as const;
const SLOPE_SIDES: readonly SlopeSide[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const LIGHT_PRESETS = Object.values(LightPreset);
const LIGHT_MOTIONS = Object.values(LightAnimation);
const LIGHT_CATEGORIES = Object.values(LightCategory);

/** How far round a flowing water turns at a step, in degrees, as its settings offer it. */
const FLOW_STEP = 45;

/** What a background layer reads before it is given a picture. */
const NO_LAYER_PICTURE = 'imageIdentifier';

/** The light settings a block and a lamp both hold. */
interface Lit {
  lightEnabled: boolean;
  lightPreset: string;
  lightBrightRadius: number;
  lightDimRadius: number;
  lightColor: string;
  lightAngle: number;
  lightDirection: number;
  lightPitch: number;
  lightAnimation: string;
}

/** The 3D model settings a block holds. */
interface Modelled {
  modelIdentifier: string;
  modelScale: string;
  modelTurn: string;
  modelIdle: string;
  modelWalk: string;
}

/**
 * Why a lookup the AI asked for would come to nothing, in the words it would refuse with, or null where it finds the
 * one thing it looks for.
 */
function refusalOf(find: () => unknown): string | null {
  try {
    find();
    return null;
  } catch (error) {
    if (error instanceof AgentToolError) return error.message;
    throw error;
  }
}

/** Why a thing locked in place may not be moved or turned, or null for one that is not. */
function lockedRefusal(locked: boolean): string | null {
  return locked ? 'It is locked in place: unlock it (locked: false) first.' : null;
}

/** A number kept to two places, as the AI is told a length. */
function twoPlaces(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A share from 0 to 1 as a whole percentage. */
function percentOf(share: number): number {
  return Math.round(share * 100);
}

/**
 * The kinds of the things laid on the table besides pieces and notes: terrain, masks, white boards, lights, ground
 * effects, background layers, rulers and effect fields, as the AI link's generic tools offer them. Each is listed as
 * this seat's screen shows it, and made, changed and taken away as the screen's own hand does it.
 */
@Injectable({ providedIn: 'root' })
export class AgentBoardKinds {
  private readonly views = inject(AgentViews);
  private readonly squares = inject(AgentSquares);
  private readonly tabletop = inject(TabletopService);
  private readonly actions = inject(TabletopActionService);
  private readonly vision = inject(VisionService);
  private readonly pieces = inject(TablePiecesService);
  private readonly doors = inject(DoorService);
  private readonly boards = inject(WhiteBoardService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly names = inject(PieceNameService);
  private readonly standing = inject(StandingGroundService);
  private readonly ambiences = inject(TableAmbienceService);
  private readonly rulers = inject(PlacedRulerService);
  private readonly readings = inject(RulerReadingService);
  private readonly effectFields = inject(EffectFieldService);
  private readonly effects = inject(EffectLibraryService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly modelStorage = inject(ModelStorage);
  private readonly objectStore = inject(ObjectStore);

  readonly kinds: readonly AnyAgentKind[] = [
    anyKind(this.terrain()),
    anyKind(this.tableMask()),
    anyKind(this.whiteBoard()),
    anyKind(this.lightSource()),
    anyKind(this.tableAmbience()),
    anyKind(this.backgroundLayer()),
    anyKind(this.ruler()),
    anyKind(this.effectField()),
  ];

  /** The size of a square of the table in view, in table pixels. */
  private grid(): number {
    const size = this.tabletop.currentTable.gridSize;
    return size > 0 ? size : 50;
  }

  /** The middle of a square of the table in view, refusing one off it. */
  private middleOf(square: AgentSquare): { x: number; y: number } {
    const middle = this.views.middleOf(square);
    if (middle) return middle;
    throw new AgentToolError('invalid_input', `There is no square ${square.col},${square.row} on the table in view.`);
  }

  /** The point a new thing is laid at: its north-west corner in the square asked for, refusing one off the table. */
  private cornerFor(args: AgentArgs): { x: number; y: number; z: number } {
    const square = args['at'] as AgentSquare | undefined;
    if (square && !this.squares.cornerOf(square)) {
      throw new AgentToolError('invalid_input', `There is no square ${square.col},${square.row} on the table in view.`);
    }
    return { ...this.squares.cornerOrMiddle(square), z: 0 };
  }

  /**
   * A thing the screen's hand has just made, laid with its north-west corner at the point asked for, where the square
   * field reads it; a refusal where nothing was made, as there is no table in view.
   */
  private laidAt<T extends TabletopObject>(made: T | undefined, corner: { x: number; y: number }): T {
    if (!made) throw new AgentToolError('not_found', 'No table is in view to lay it on.');
    made.location.x = corner.x;
    made.location.y = corner.y;
    made.update();
    return made;
  }

  /**
   * The picture a reference names among those this seat may pick, as the screen's picker offers them, by its id or
   * its name; nothing for an empty reference.
   */
  private pictureNamed(reference: string): string {
    const wanted = reference.trim();
    if (!wanted) return '';
    const sight = this.tagLock.sight();
    const pickable = this.imageStorage.images.filter(
      (image) => !isAccountAvatar(image.identifier) && canBrowseImage(ImageTag.get(image.identifier), sight)
    );
    return findOne(
      pickable,
      wanted,
      (image) => image.identifier,
      (image) => image.name,
      'image'
    ).identifier;
  }

  /** The 3D model a reference names among those ready to draw, by its id or its name; nothing for an empty one. */
  private modelNamed(reference: string): string {
    const wanted = reference.trim();
    if (!wanted) return '';
    return findOne(
      this.modelStorage.models.filter((model) => model.isReady),
      wanted,
      (model) => model.identifier,
      (model) => model.name,
      'model'
    ).identifier;
  }

  /** The piece a reference names among those this seat sees on the table, by its id or its name as shown. */
  private pieceNamed(reference: string, among: readonly GameCharacter[] = this.views.visiblePieces()): GameCharacter {
    return findOne(
      among,
      reference,
      (piece) => piece.identifier,
      (piece) => this.views.nameOf(piece),
      'piece'
    );
  }

  /** Its name, written as the screen's sheet writes it. */
  private nameField<T extends TabletopObject>(): AgentKindField<T> {
    return textField<T>(
      'name',
      'Its name.',
      'write',
      (object) => object.name,
      (object, value) => {
        object.name = value;
      },
      200
    );
  }

  /** The square a thing lies in, which a thing locked in place is not moved from, as the screen does not drag it. */
  private squareField<T extends TabletopObject>(locked: (object: T) => boolean): AgentKindField<T> {
    return this.squares.field<T>((object) => lockedRefusal(locked(object)));
  }

  /** How high above the floor a thing stands, and whether the screen marks that height. */
  private altitudeFields<T extends TabletopObject>(): AgentKindField<T>[] {
    return [
      numberField<T>(
        'altitude',
        'How many squares above the floor it stands; below 0 sinks it into the floor.',
        'write',
        { minimum: -100, maximum: 100 },
        (object) => object.altitude,
        (object, value) => {
          object.altitude = value;
        }
      ),
      flagField<T>(
        'show_altitude',
        'Whether the screen marks how high it stands.',
        'write',
        (object) => object.isAltitudeIndicate,
        (object, value) => {
          object.isAltitudeIndicate = value;
        }
      ),
    ];
  }

  /** A field holding a colour as #rrggbb, an empty value let through where it puts the thing's own colour back. */
  private colourField<T>(
    name: string,
    description: string,
    read: (object: T) => unknown,
    put: (object: T, value: string) => void,
    emptyAllowed = false
  ): AgentKindField<T> {
    return {
      ...textField<T>(name, description, 'write', read, put, 7),
      refuse: (_object, value) =>
        (emptyAllowed && value === '') || COLOUR.test(value as string)
          ? null
          : `The ${name} must be a colour written as #rrggbb.`,
    };
  }

  /** A field holding a picture, written by the id or name of one this seat may pick, or empty for none. */
  private pictureField<T>(
    name: string,
    description: string,
    read: (object: T) => unknown,
    put: (object: T, identifier: string) => void
  ): AgentKindField<T> {
    return {
      ...textField<T>(name, description, 'write', read, (object, value) => put(object, this.pictureNamed(value)), 500),
      refuse: (_object, value) => refusalOf(() => this.pictureNamed(value as string)),
    };
  }

  /** A share from 0 to 100, kept on the thing from 0 to 1. */
  private percentField<T>(
    name: string,
    description: string,
    read: (object: T) => number,
    put: (object: T, share: number) => void
  ): AgentKindField<T> {
    return numberField<T>(
      name,
      description,
      'write',
      { minimum: 0, maximum: 100 },
      (object) => percentOf(read(object)),
      (object, value) => put(object, clamp01(Math.round(value) / 100))
    );
  }

  /** The settings a light is given by, which a block that glows and a lamp share, each named with a prefix. */
  private lightFields<T extends Lit>(prefix: string): AgentKindField<T>[] {
    return [
      choiceField<T, LightPreset>(
        `${prefix}preset`,
        "The kind of lamp it is lit as. Choosing one lays that lamp's radii, colour, angle and motion over the others and turns the light on; custom keeps them as they are.",
        'write',
        LIGHT_PRESETS,
        (object) => object.lightPreset,
        (object, value) => {
          applyLightPreset(object, value);
          object.lightEnabled = true;
        }
      ),
      numberField<T>(
        `${prefix}bright_radius`,
        'How many squares round it are brightly lit.',
        'write',
        { minimum: 0, maximum: 30 },
        (object) => object.lightBrightRadius,
        (object, value) => {
          object.lightBrightRadius = value;
        }
      ),
      numberField<T>(
        `${prefix}dim_radius`,
        'How many squares round it are dimly lit.',
        'write',
        { minimum: 0, maximum: 30 },
        (object) => object.lightDimRadius,
        (object, value) => {
          object.lightDimRadius = value;
        }
      ),
      this.colourField<T>(
        `${prefix}colour`,
        'The colour of the light, as #rrggbb.',
        (object) => object.lightColor,
        (object, value) => {
          object.lightColor = value;
        }
      ),
      numberField<T>(
        `${prefix}angle`,
        'How wide the light is spread, in degrees; 360 lights all round.',
        'write',
        { minimum: 0, maximum: 360 },
        (object) => object.lightAngle,
        (object, value) => {
          object.lightAngle = value;
        }
      ),
      numberField<T>(
        `${prefix}direction`,
        'Which way a light narrower than 360 degrees points, in degrees clockwise.',
        'write',
        { minimum: 0, maximum: 360 },
        (object) => object.lightDirection,
        (object, value) => {
          object.lightDirection = value;
        }
      ),
      numberField<T>(
        `${prefix}pitch`,
        'How far the light is tipped up (above 0) or down (below 0), in degrees.',
        'write',
        { minimum: -90, maximum: 90 },
        (object) => object.lightPitch,
        (object, value) => {
          object.lightPitch = value;
        }
      ),
      choiceField<T, LightAnimation>(
        `${prefix}motion`,
        'How the light moves: steady (none), flickering, pulsing or buzzing like a neon tube.',
        'write',
        LIGHT_MOTIONS,
        (object) => object.lightAnimation,
        (object, value) => {
          object.lightAnimation = value;
        }
      ),
    ];
  }

  /** The 3D model a block is drawn as, and how it is drawn, as the sheet's model fields write them. */
  private modelFields<T extends Modelled>(): AgentKindField<T>[] {
    return [
      {
        ...textField<T>(
          'model',
          'The id of the 3D model it is drawn as in place of its faces, or empty for none. Write a model by its id or name.',
          'write',
          (object) => object.modelIdentifier,
          (object, value) => {
            object.modelIdentifier = this.modelNamed(value);
          },
          500
        ),
        refuse: (_object, value) => refusalOf(() => this.modelNamed(value as string)),
      },
      numberField<T>(
        'model_scale',
        'How many times larger than its footprint its model is drawn.',
        'write',
        { minimum: MIN_MODEL_SCALE, maximum: MAX_MODEL_SCALE },
        (object) => modelScaleOf(object.modelScale),
        (object, value) => {
          object.modelScale = `${modelScaleOf(value)}`;
        }
      ),
      numberField<T>(
        'model_turn',
        'How far its model is turned from the way it faces, in degrees clockwise.',
        'write',
        { minimum: 0, maximum: 360 },
        (object) => modelTurnOf(object.modelTurn),
        (object, value) => {
          object.modelTurn = `${modelTurnOf(value)}`;
        }
      ),
      textField<T>(
        'model_idle',
        "The motion its model plays standing still, by name; empty for the model's own.",
        'write',
        (object) => object.modelIdle,
        (object, value) => {
          object.modelIdle = value.trim();
        },
        200
      ),
      textField<T>(
        'model_walk',
        "The motion its model plays walking, by name; empty for the model's own.",
        'write',
        (object) => object.modelWalk,
        (object, value) => {
          object.modelWalk = value.trim();
        },
        200
      ),
    ];
  }

  private terrain(): AgentKind<Terrain> {
    const sides = () => gridSlopeSides(this.tabletop.currentTable.gridType);
    const pictures: AgentSchema = {
      type: 'object',
      description:
        'The pictures of its faces by slot, each the id or name of a picture or empty for none: wall stands in for every side without one of its own, floor for the top and the underside. Only the slots given are changed.',
      properties: Object.fromEntries(
        TERRAIN_IMAGE_SLOTS.map((slot) => [slot, { type: 'string', maxLength: 500 } satisfies AgentSchema])
      ),
      additionalProperties: false,
    };
    const door = (open: boolean) => (terrain: Terrain) => {
      if (!terrain.isDoor) throw new AgentToolError('invalid_input', 'This block is not a door.');
      if (!this.doors.setOpen(terrain, open)) throw new AgentToolError('not_allowed', 'This seat may not open it.');
      return { id: terrain.identifier, door_open: terrain.isDoorOpen };
    };
    return {
      kind: Terrain.aliasName,
      description:
        "A block of terrain on the table in view: a floor, a wall, a step, a slope, a door, built as a box of squares. A block with neither pictures nor a model is see-through glass that still stops what it stops; only the game master's seat comes across it. Blocks wholly under the fog are left out.",
      list: () => this.tabletop.terrains.filter((terrain) => this.pieces.isBlockShown(terrain)),
      idOf: (terrain) => terrain.identifier,
      nameOf: (terrain) => terrain.name,
      fields: [
        this.nameField<Terrain>(),
        this.squareField<Terrain>((terrain) => terrain.isLocked),
        numberField<Terrain>(
          'width',
          'How many squares it runs from west to east.',
          'write',
          { minimum: 0, maximum: 200 },
          (terrain) => terrain.width,
          (terrain, value) => {
            terrain.width = value;
          }
        ),
        numberField<Terrain>(
          'depth',
          'How many squares it runs from north to south.',
          'write',
          { minimum: 0, maximum: 200 },
          (terrain) => terrain.depth,
          (terrain, value) => {
            terrain.depth = value;
          }
        ),
        numberField<Terrain>(
          'height',
          'How many squares tall it stands.',
          'write',
          { minimum: 0, maximum: 100 },
          (terrain) => terrain.height,
          (terrain, value) => {
            terrain.height = value;
          }
        ),
        ...this.altitudeFields<Terrain>(),
        {
          ...numberField<Terrain>(
            'turn',
            'How far it is turned clockwise, in degrees.',
            'write',
            { minimum: 0, maximum: 360 },
            (terrain) => terrain.rotate,
            (terrain, value) => {
              terrain.rotate = value;
            }
          ),
          refuse: (terrain) => lockedRefusal(terrain.isLocked),
        },
        flagField<Terrain>(
          'locked',
          'Whether it is locked in place, so it is not moved or turned.',
          'write',
          (terrain) => terrain.isLocked,
          (terrain, value) => {
            terrain.isLocked = value;
          }
        ),
        choiceField<Terrain, string>(
          'draws',
          'Which faces are drawn: all, only its top and underside (floor), only its sides (wall), or none.',
          'write',
          Object.keys(DRAWS),
          (terrain) => Object.keys(DRAWS).find((word) => DRAWS[word] === terrain.mode) ?? 'all',
          (terrain, value) => {
            terrain.mode = DRAWS[value];
            if (value !== 'floor' || terrain.width * terrain.depth !== 0) return;
            terrain.width = terrain.width <= 0 ? 1 : terrain.width;
            terrain.depth = terrain.depth <= 0 ? 1 : terrain.depth;
          }
        ),
        {
          name: 'slope',
          description:
            'The sides its top slopes down to (n, e, s, w on a square table; six of n, ne, se, s, sw, nw or ne, e, se, sw, w, nw on a hex one); empty for a flat top. Sides the table has not are dropped.',
          schema: { type: 'array', items: { type: 'string', enum: SLOPE_SIDES }, maxItems: SLOPE_SIDES.length },
          access: 'write',
          read: (terrain) => drawnSlopeSides(terrain, sides()),
          put: (terrain, value) => {
            terrain.slopeSides = slopeSidesOn(value as SlopeSide[], sides());
          },
        },
        flagField<Terrain>(
          'drop_shadow',
          'Whether it casts a shadow.',
          'write',
          (terrain) => terrain.isDropShadow,
          (terrain, value) => {
            terrain.isDropShadow = value;
          }
        ),
        flagField<Terrain>(
          'shading',
          'Whether its faces are shaded by the way they face.',
          'write',
          (terrain) => terrain.isSurfaceShading,
          (terrain, value) => {
            terrain.isSurfaceShading = value;
          }
        ),
        flagField<Terrain>(
          'grid',
          'Whether the grid is drawn on its top.',
          'write',
          (terrain) => terrain.isGrid,
          (terrain, value) => {
            terrain.isGrid = value;
          }
        ),
        flagField<Terrain>(
          'tiled',
          'Whether its pictures are tiled a square at a time rather than stretched over each face.',
          'write',
          (terrain) => terrain.isTiledTexture,
          (terrain, value) => {
            terrain.isTiledTexture = value;
          }
        ),
        flagField<Terrain>(
          'blocks_sight',
          'Whether it stops sight (an open door lets sight through whatever this says).',
          'write',
          (terrain) => terrain.blocksSight,
          (terrain, value) => {
            terrain.blocksSight = value;
          }
        ),
        flagField<Terrain>(
          'blocks_light',
          'Whether it stops light (an open door lets light through whatever this says).',
          'write',
          (terrain) => terrain.blocksLight,
          (terrain, value) => {
            terrain.blocksLight = value;
          }
        ),
        flagField<Terrain>(
          'blocks_climb',
          'Whether it is too sheer to step up onto, so pieces go round it.',
          'write',
          (terrain) => terrain.blocksClimb,
          (terrain, value) => {
            terrain.blocksClimb = value;
          }
        ),
        choiceField<Terrain, DoorStyle>(
          'door',
          'Whether it is a door, and how one opens: swinging on a hinge, sliding aside, lifting or sinking; none for no door, which also shuts it. Open and shut one with the open_door and close_door actions.',
          'write',
          DOOR_STYLES,
          (terrain) => terrain.doorStyle,
          (terrain, value) => {
            terrain.setDoor(value);
          }
        ),
        flagField<Terrain>(
          'door_mirrored',
          'Whether the door opens the other way round, as the second of a pair does.',
          'write',
          (terrain) => terrain.doorMirrored,
          (terrain, value) => {
            terrain.doorMirrored = value;
          }
        ),
        flagField<Terrain>('door_open', 'Whether the door stands open.', null, (terrain) => terrain.isDoorOpen),
        {
          name: 'pictures',
          description: pictures.description!,
          schema: pictures,
          access: 'write',
          read: (terrain) =>
            Object.fromEntries(TERRAIN_IMAGE_SLOTS.map((slot) => [slot, terrain.faceImageIdentifier(slot)])),
          refuse: (_terrain, value) =>
            Object.values(value as Record<TerrainImageSlot, string>)
              .map((reference) => refusalOf(() => this.pictureNamed(reference)))
              .find((reason) => reason !== null) ?? null,
          put: (terrain, value) => {
            for (const [slot, reference] of Object.entries(value as Record<TerrainImageSlot, string>)) {
              terrain.setFaceImage(slot as TerrainImageSlot, this.pictureNamed(reference));
            }
          },
        },
        flagField<Terrain>(
          'glass',
          "Whether it is drawn with nothing, neither a picture on any face nor a model, which makes it see-through glass only the game master's seat comes across.",
          null,
          (terrain) => this.pieces.isGlass(terrain)
        ),
        flagField<Terrain>(
          'light',
          'Whether it glows. Turned on with no dim radius, it glows as a torch.',
          'write',
          (terrain) => terrain.lightEnabled,
          (terrain, value) => {
            terrain.lightEnabled = value;
            if (value && terrain.lightDimRadius <= 0) applyLightPreset(terrain, LightPreset.TORCH);
          }
        ),
        ...this.lightFields<Terrain>('light_'),
        ...this.modelFields<Terrain>(),
      ],
      create: {
        access: 'write',
        description:
          'Lays a new crate block two squares across and two tall on the table in view, its north-west corner in the square.',
        input: objectInput({ at: AT }),
        make: (args) => {
          const corner = this.cornerFor(args);
          return this.laidAt(this.actions.createTerrain(corner), corner);
        },
      },
      remove: { access: 'write', take: (terrain) => terrain.destroy() },
      actions: [
        {
          name: 'open_door',
          description: 'Opens the door, with the sound of it for the room.',
          access: 'write',
          input: objectInput(),
          run: door(true),
        },
        {
          name: 'close_door',
          description: 'Shuts the door, with the sound of it for the room.',
          access: 'write',
          input: objectInput(),
          run: door(false),
        },
      ],
    };
  }

  private tableMask(): AgentKind<GameTableMask> {
    const scratcher = (mask: GameTableMask) => (mask.owner ? this.views.seatName(mask.owner) : '');
    return {
      kind: GameTableMask.aliasName,
      description:
        'A mask over part of the table in view, hiding what is under it until it is taken away or scratched open a square at a time.',
      list: () => this.tabletop.tableMasks,
      idOf: (mask) => mask.identifier,
      nameOf: (mask) => mask.name,
      fields: [
        this.nameField<GameTableMask>(),
        this.squareField<GameTableMask>((mask) => mask.isLock),
        numberField<GameTableMask>(
          'width',
          'How many squares wide.',
          'write',
          { minimum: 1, maximum: 200, integer: true },
          (mask) => mask.width,
          (mask, value) => {
            mask.width = value;
          }
        ),
        numberField<GameTableMask>(
          'height',
          'How many squares from north to south.',
          'write',
          { minimum: 1, maximum: 200, integer: true },
          (mask) => mask.height,
          (mask, value) => {
            mask.height = value;
          }
        ),
        ...this.altitudeFields<GameTableMask>(),
        numberField<GameTableMask>(
          'opacity',
          'How opaque it is, from 0 to 100.',
          'write',
          { minimum: 0, maximum: 100 },
          (mask) => mask.opacityPercent,
          (mask, value) => {
            mask.opacityPercent = value;
          }
        ),
        this.colourField<GameTableMask>(
          'colour',
          'The colour it is filled with where it has no picture, as #rrggbb.',
          (mask) => mask.bgcolor,
          (mask, value) => mask.paintColor(value)
        ),
        this.pictureField<GameTableMask>(
          'picture',
          'The id of its picture, or empty to fill it with its colour.',
          (mask) => mask.imageIdentifier,
          (mask, identifier) => {
            mask.imageIdentifier = identifier;
          }
        ),
        this.colourField<GameTableMask>(
          'scratched_colour',
          'The colour shown in the squares scratched open, as #rrggbb, or empty to show the picture or the table.',
          (mask) => mask.scratchedColor,
          (mask, value) => {
            mask.scratchedColor = value;
          },
          true
        ),
        this.pictureField<GameTableMask>(
          'scratched_picture',
          'The id of the picture shown in the squares scratched open, or empty for none.',
          (mask) => mask.scratchedImageIdentifier,
          (mask, identifier) => {
            mask.scratchedImageIdentifier = identifier;
          }
        ),
        textField<GameTableMask>(
          'text',
          'Words written across it.',
          'write',
          (mask) => mask.text,
          (mask, value) => {
            mask.text = value;
          }
        ),
        numberField<GameTableMask>(
          'text_size',
          'How large the words are, in pixels.',
          'write',
          { minimum: 8, maximum: 200, integer: true },
          (mask) => mask.textSize,
          (mask, value) => {
            mask.textSize = value;
          }
        ),
        this.colourField<GameTableMask>(
          'text_colour',
          'The colour of the words, as #rrggbb.',
          (mask) => mask.textColor,
          (mask, value) => {
            mask.textColor = value;
          }
        ),
        flagField<GameTableMask>(
          'text_outline',
          'Whether the words have a dark outline.',
          'write',
          (mask) => mask.textOutline,
          (mask, value) => {
            mask.textOutline = value;
          }
        ),
        flagField<GameTableMask>(
          'locked',
          'Whether it is locked in place. Unlocking it shows its lock mark again.',
          'write',
          (mask) => mask.isLock,
          (mask, value) => {
            mask.isLock = value;
            if (!value) mask.dispLockMark = true;
          }
        ),
        flagField<GameTableMask>(
          'lock_mark',
          'Whether a locked mask shows that it is locked.',
          'write',
          (mask) => mask.dispLockMark,
          (mask, value) => {
            mask.dispLockMark = value;
          }
        ),
        textField<GameTableMask>(
          'scratching_by',
          'The seat scratching it open just now, or empty for none.',
          null,
          scratcher
        ),
        textField<GameTableMask>(
          'scratching',
          'The squares being scratched open just now, as the screen keeps them.',
          null,
          (mask) => mask.scratchingGrids
        ),
        textField<GameTableMask>(
          'scratched',
          'The squares scratched open, as the screen keeps them.',
          null,
          (mask) => mask.scratchedGrids
        ),
        flagField<GameTableMask>(
          'preview',
          'Whether the squares being scratched are shown before they are scratched open.',
          null,
          (mask) => mask.isPreview
        ),
      ],
      create: {
        access: 'write',
        description: 'Lays a new mask five squares by five on the table in view, its north-west corner in the square.',
        input: objectInput({ at: AT }),
        make: (args) => {
          const corner = this.cornerFor(args);
          return this.laidAt(this.actions.createGameTableMask(corner), corner);
        },
      },
      remove: { access: 'write', take: (mask) => mask.destroy() },
    };
  }

  private whiteBoard(): AgentKind<WhiteBoard> {
    const gridOf = (board: WhiteBoard) => (board.parent instanceof GameTable ? board.parent.gridSize : this.grid());
    return {
      kind: WhiteBoard.aliasName,
      description:
        'A white board on the table in view: a sheet to draw on, standing up behind the map or laid over it, which anything on the table may be set on; taking it away puts what is on it back on the table where it appeared to be. Its drawing is made on the screen and only read here.',
      list: () => this.tabletop.whiteBoards,
      idOf: (board) => board.identifier,
      nameOf: (board) => board.name,
      fields: [
        this.nameField<WhiteBoard>(),
        this.squareField<WhiteBoard>((board) => board.isLock),
        numberField<WhiteBoard>(
          'width',
          'How many squares wide.',
          'write',
          { minimum: 1, maximum: 40, integer: true },
          (board) => board.width,
          (board, value) => {
            board.width = value;
          }
        ),
        numberField<WhiteBoard>(
          'height',
          'How many squares deep, its foot kept where it stands.',
          'write',
          { minimum: 1, maximum: 40, integer: true },
          (board) => board.height,
          (board, value) => setBoardHeightKeepingFoot(board, value, gridOf(board))
        ),
        numberField<WhiteBoard>(
          'pitch',
          'How far it is tilted up off the table, in degrees: 0 lies flat, 90 stands upright.',
          'write',
          { minimum: 0, maximum: MAX_BOARD_PITCH, integer: true },
          (board) => board.pitch,
          (board, value) => {
            board.pitch = clampBoardPitch(value);
          }
        ),
        numberField<WhiteBoard>(
          'turn',
          'How far it is turned on the table, in whole degrees.',
          'write',
          { minimum: 0, maximum: 360 },
          (board) => board.rotate,
          (board, value) => {
            board.rotate = Math.round(value) % 360;
          }
        ),
        numberField<WhiteBoard>(
          'opacity',
          'How much its face shows, from 0 (only the drawing shows) to 100.',
          'write',
          { minimum: 0, maximum: 100 },
          (board) => percentOf(board.opacity),
          (board, value) => {
            board.opacity = clamp(Math.round(value), 0, 100) / 100;
            board.update();
          }
        ),
        this.colourField<WhiteBoard>(
          'colour',
          'The colour of its face, as #rrggbb.',
          (board) => board.color,
          (board, value) => {
            board.color = value;
          }
        ),
        flagField<WhiteBoard>(
          'drop_shadow',
          'Whether it casts a shadow on the table.',
          'write',
          (board) => board.isDropShadow,
          (board, value) => {
            board.isDropShadow = value;
          }
        ),
        flagField<WhiteBoard>(
          'locked',
          'Whether it is locked in place.',
          'write',
          (board) => board.isLock,
          (board, value) => {
            board.isLock = value;
          }
        ),
        textField<WhiteBoard>(
          'picture',
          'The id of the picture its drawing was last kept as, or empty before it is drawn on.',
          null,
          (board) => `${board.imageDataElement?.getFirstElementByName('imageIdentifier')?.value ?? ''}`
        ),
        flagField<WhiteBoard>(
          'has_drawing',
          'Whether anything has been drawn on it.',
          null,
          (board) => board.scene.length > 0
        ),
      ],
      create: {
        access: 'write',
        description:
          'Stands a new board as wide and as deep as the table in view a square north of it, beside any board already there.',
        input: objectInput(),
        make: () => this.actions.createWhiteBoard({ x: 0, y: 0, z: 0 }),
      },
      remove: {
        access: 'write',
        take: (board) => this.boards.takeDown(board),
      },
    };
  }

  private lightSource(): AgentKind<LightSource> {
    const followable = () => this.views.visiblePieces().filter((piece) => !this.names.isKept(piece));
    return {
      kind: LightSource.aliasName,
      description:
        'A lamp standing on the table in view, lighting the squares round it. Lamps on ground nobody has walked to are left out.',
      list: () => this.tabletop.lightSources.filter((light) => !this.vision.isPieceHiddenByFog(light, 1)),
      idOf: (light) => light.identifier,
      nameOf: (light) => light.name,
      fields: [
        this.nameField<LightSource>(),
        this.squareField<LightSource>((light) => light.isLock),
        ...this.altitudeFields<LightSource>(),
        flagField<LightSource>(
          'locked',
          'Whether it is locked in place.',
          'write',
          (light) => light.isLock,
          (light, value) => {
            light.isLock = value;
          }
        ),
        flagField<LightSource>(
          'on',
          'Whether it is lit.',
          'write',
          (light) => light.lightEnabled,
          (light, value) => {
            light.lightEnabled = value;
          }
        ),
        ...this.lightFields<LightSource>(''),
        choiceField<LightSource, LightCategory>(
          'category',
          'Whether it is a light in the world (physical), or one for the scene that only sets the mood (theatrical).',
          'write',
          LIGHT_CATEGORIES,
          (light) => light.lightCategory,
          (light, value) => {
            light.lightCategory = value;
          }
        ),
        flagField<LightSource>(
          'ignores_walls',
          'Whether it shines through what stops light.',
          'write',
          (light) => light.lightIgnoreOcclusion,
          (light, value) => {
            light.lightIgnoreOcclusion = value;
          }
        ),
        flagField<LightSource>(
          'shown_to_all',
          'Whether what it lights is shown to every seat, whoever sees it.',
          'write',
          (light) => light.lightRevealToAll,
          (light, value) => {
            light.lightRevealToAll = value;
          }
        ),
        flagField<LightSource>(
          'casts_shadows',
          'Whether what stands in its light casts shadows.',
          'write',
          (light) => light.lightCastShadows,
          (light, value) => {
            light.lightCastShadows = value;
          }
        ),
        {
          ...textField<LightSource>(
            'following',
            'The id of the piece it follows, moving with it, or empty for none. Write a piece this seat sees by its id or name.',
            'write',
            (light) => {
              const followed = light.followingCharacterIdentifier;
              if (!followed) return '';
              const piece = this.objectStore.get<GameCharacter>(followed);
              return piece instanceof GameCharacter && this.views.sees(piece) ? followed : undefined;
            },
            (light, value) => {
              light.followingCharacterIdentifier = value.trim() ? this.pieceNamed(value, followable()).identifier : '';
              if (light.followingCharacterIdentifier) light.following(this.grid());
            },
            200
          ),
          refuse: (_light, value) =>
            (value as string).trim() ? refusalOf(() => this.pieceNamed(value as string, followable())) : null,
        },
        this.pictureField<LightSource>(
          'picture',
          'The id of the picture it is drawn as, or empty for the plain lamp.',
          (light) => `${light.imageDataElement?.getFirstElementByName('imageIdentifier')?.value ?? ''}`,
          (light, identifier) => {
            const element = light.imageDataElement?.getFirstElementByName('imageIdentifier');
            if (!element) return;
            element.value = identifier;
            light.update();
          }
        ),
      ],
      create: {
        access: 'write',
        description: 'Stands a new lamp, owned by this seat, in the square on the table in view.',
        input: objectInput({ at: AT }),
        make: (args) => {
          const corner = this.cornerFor(args);
          return this.laidAt(this.actions.createLightSource(corner), corner);
        },
      },
      remove: { access: 'write', take: (light) => light.destroy() },
    };
  }

  private tableAmbience(): AgentKind<TableAmbience> {
    return {
      kind: TableAmbience.aliasName,
      description:
        'A ground effect laid over squares of the table in view: a swamp, flames, a vent, fog, miasma, lava, frost, blooms or water. One shown only to the game master, or only where a seat can see, is left out where this seat is not shown it.',
      list: () => this.ambiences.shown(),
      idOf: (ambience) => ambience.identifier,
      nameOf: (ambience) => ambience.name,
      fields: [
        this.nameField<TableAmbience>(),
        this.squareField<TableAmbience>((ambience) => ambience.isLock),
        numberField<TableAmbience>(
          'width',
          'How many squares wide.',
          'write',
          { minimum: 1, maximum: 100, integer: true },
          (ambience) => ambience.width,
          (ambience, value) => {
            ambience.width = value;
          }
        ),
        numberField<TableAmbience>(
          'height',
          'How many squares from north to south.',
          'write',
          { minimum: 1, maximum: 100, integer: true },
          (ambience) => ambience.height,
          (ambience, value) => {
            ambience.height = value;
          }
        ),
        choiceField<TableAmbience, AmbienceKind>(
          'kind',
          'What it is.',
          'write',
          GROUND_AMBIENCE_KINDS,
          (ambience) => ambience.kind,
          (ambience, value) => {
            ambience.ambienceKind = value;
          }
        ),
        this.colourField<TableAmbience>(
          'colour',
          'Its colour, as #rrggbb; write empty for the colour of its kind.',
          (ambience) => ambience.color,
          (ambience, value) => {
            ambience.ambienceColor = value;
          },
          true
        ),
        this.percentField<TableAmbience>(
          'density',
          'How thick it is, from 0 to 100.',
          (ambience) => ambience.density,
          (ambience, share) => {
            ambience.ambienceDensity = share;
          }
        ),
        choiceField<TableAmbience, ShownTo>(
          'shown_to',
          'Who sees it: every seat (room), only seats whose pieces can see it (sight), or the game master alone (master).',
          'write',
          SHOWN_TO,
          (ambience) => ambience.shows,
          (ambience, value) => {
            ambience.shownTo = value;
          }
        ),
        flagField<TableAmbience>(
          'blocks_sight',
          'Whether it stops sight.',
          'write',
          (ambience) => ambience.blocksSight,
          (ambience, value) => {
            ambience.blocksSight = value;
          }
        ),
        choiceField<TableAmbience, AmbienceBrightness>(
          'brightness',
          'How it lights the ground it lies on: not at all (none), darkening it, dimly or brightly.',
          'write',
          AMBIENCE_BRIGHTNESS,
          (ambience) => ambience.shade,
          (ambience, value) => {
            ambience.brightness = value;
          }
        ),
        flagField<TableAmbience>(
          'locked',
          'Whether it is locked in place.',
          'write',
          (ambience) => ambience.isLock,
          (ambience, value) => {
            ambience.isLock = value;
          }
        ),
        numberField<TableAmbience>(
          'surface_height',
          'For water: how many squares its surface stands over its floor.',
          'write',
          { minimum: 0, maximum: MAX_SURFACE_CELLS },
          (ambience) => ambience.surface,
          (ambience, value) => {
            ambience.surfaceHeight = clamp(Math.round(value * 10) / 10, 0, MAX_SURFACE_CELLS);
          }
        ),
        this.percentField<TableAmbience>(
          'murk',
          'For water: how murky it is, from 0 for clear to 100 for mud.',
          (ambience) => ambience.murk,
          (ambience, share) => {
            ambience.turbidity = share;
          }
        ),
        this.percentField<TableAmbience>(
          'dirt',
          'For water: how much dirt floats on it, from 0 to 100.',
          (ambience) => ambience.dirt,
          (ambience, share) => {
            ambience.dirtiness = share;
          }
        ),
        this.percentField<TableAmbience>(
          'leaves',
          'For water: how many leaves float on it, from 0 to 100.',
          (ambience) => ambience.leaves,
          (ambience, share) => {
            ambience.floatingLeaves = share;
          }
        ),
        this.percentField<TableAmbience>(
          'flow_speed',
          'For water: how fast it flows, from 0 for still to 100.',
          (ambience) => ambience.flow,
          (ambience, share) => {
            ambience.flowSpeed = share;
          }
        ),
        numberField<TableAmbience>(
          'flow_direction',
          'For water: which way it flows, in degrees clockwise from north, in steps of 45.',
          'write',
          { minimum: 0, maximum: 360 },
          (ambience) => ambience.flowHeading,
          (ambience, value) => {
            ambience.flowDirection = (Math.round(value / FLOW_STEP) * FLOW_STEP) % 360;
          }
        ),
        this.percentField<TableAmbience>(
          'ice',
          'For water: how much of it is frozen over, from 0 to 100.',
          (ambience) => ambience.ice,
          (ambience, share) => {
            ambience.iceCover = share;
          }
        ),
      ],
      create: {
        access: 'write',
        description:
          'Lays a new ground effect of a kind, four squares by four, on the table in view, its north-west corner in the square.',
        input: objectInput(
          {
            kind: { type: 'string', enum: GROUND_AMBIENCE_KINDS, description: 'What it is.' },
            at: AT,
          },
          ['kind']
        ),
        make: (args) => {
          const corner = this.cornerFor(args);
          return this.laidAt(this.actions.createTableAmbience(corner, args['kind'] as AmbienceKind), corner);
        },
      },
      remove: { access: 'write', take: (ambience) => ambience.destroy() },
    };
  }

  /** The layers drawn the same way as one on the same table, furthest back first, as the table's settings list them. */
  private layerRun(layer: TableBackgroundLayer): TableBackgroundLayer[] {
    const table = layer.parent;
    if (!(table instanceof GameTable)) return [layer];
    const placement = asTableLayerPlacement(layer.placement);
    return table.backgroundLayers.filter((laid) => asTableLayerPlacement(laid.placement) === placement);
  }

  /** The order after every layer of a table, which a layer added or moved to another placement takes. */
  private nextLayerOrder(table: GameTable): number {
    return table.backgroundLayers.reduce((highest, laid) => Math.max(highest, laid.order + 1), 0);
  }

  private backgroundLayer(): AgentKind<TableBackgroundLayer> {
    const tableOf = (layer: TableBackgroundLayer) => (layer.parent instanceof GameTable ? layer.parent : null);
    const move = (offset: number) => (layer: TableBackgroundLayer) => {
      const run = this.layerRun(layer);
      const from = run.indexOf(layer);
      const to = from + offset;
      if (to < 0 || to >= run.length) {
        throw new AgentToolError(
          'invalid_input',
          `It is already the ${offset < 0 ? 'furthest back' : 'furthest forward'} of its placement.`
        );
      }
      moveBackgroundLayer(run, from, offset).forEach((laid, order) => {
        if (laid.order === order) return;
        laid.order = order;
        laid.update();
      });
      return { id: layer.identifier, place: to + 1 };
    };
    const layerField = (
      name: string,
      description: string,
      bounds: { minimum: number; maximum: number },
      read: (layer: TableBackgroundLayer) => number,
      put: (layer: TableBackgroundLayer, value: number) => void
    ) =>
      numberField<TableBackgroundLayer>(name, description, 'write', bounds, read, (layer, value) => {
        put(layer, value);
        layer.update();
      });
    return {
      kind: TableBackgroundLayer.aliasName,
      description: `A picture a table draws under its board, over it, or far behind it as a backdrop, drifting as it is set to. A table holds at most ${MAX_TABLE_BACKGROUND_LAYERS}.`,
      list: () => this.views.tables().flatMap((table) => table.backgroundLayers),
      idOf: (layer) => layer.identifier,
      nameOf: (layer) =>
        `${tableOf(layer)?.name ?? ''} ${asTableLayerPlacement(layer.placement)} ${this.layerRun(layer).indexOf(layer) + 1}`.trim(),
      fields: [
        textField<TableBackgroundLayer>(
          'table',
          'The name of the table it belongs to.',
          null,
          (layer) => tableOf(layer)?.name ?? ''
        ),
        numberField<TableBackgroundLayer>(
          'place',
          'Where it is drawn among the layers of its placement, from 1 furthest back.',
          null,
          {},
          (layer) => this.layerRun(layer).indexOf(layer) + 1
        ),
        {
          ...this.pictureField<TableBackgroundLayer>(
            'picture',
            'The id of its picture. Write one by its id or name.',
            (layer) => (layer.imageIdentifier === NO_LAYER_PICTURE ? '' : layer.imageIdentifier),
            (layer, identifier) => {
              layer.imageIdentifier = identifier;
              layer.update();
            }
          ),
          schema: { type: 'string', minLength: 1, maxLength: 500 },
        },
        flagField<TableBackgroundLayer>(
          'shown',
          'Whether it is drawn.',
          'write',
          (layer) => layer.enabled,
          (layer, value) => {
            layer.enabled = value;
            layer.update();
          }
        ),
        choiceField<TableBackgroundLayer, TableLayerPlacement>(
          'placement',
          'Where it is drawn: under the board, over it, or far behind it as a backdrop. Moving it to another placement puts it in front of the layers there.',
          'write',
          TABLE_LAYER_PLACEMENTS,
          (layer) => asTableLayerPlacement(layer.placement),
          (layer, value) => {
            const table = tableOf(layer);
            if (asTableLayerPlacement(layer.placement) === value || !table) return;
            layer.placement = value;
            layer.order = this.nextLayerOrder(table);
            layer.update();
          }
        ),
        layerField(
          'speed_x',
          'How fast it drifts east (below 0, west).',
          { minimum: -MAX_BACKGROUND_SCROLL_SPEED, maximum: MAX_BACKGROUND_SCROLL_SPEED },
          (layer) => layer.speedX,
          (layer, value) => {
            layer.speedX = value;
          }
        ),
        layerField(
          'speed_y',
          'How fast it drifts south (below 0, north).',
          { minimum: -MAX_BACKGROUND_SCROLL_SPEED, maximum: MAX_BACKGROUND_SCROLL_SPEED },
          (layer) => layer.speedY,
          (layer, value) => {
            layer.speedY = value;
          }
        ),
        layerField(
          'opacity',
          'How opaque it is, from 0 to 100.',
          { minimum: 0, maximum: 100 },
          (layer) => percentOf(layer.opacity),
          (layer, value) => {
            layer.opacity = value / 100;
          }
        ),
        layerField(
          'scale',
          'How many times larger than the picture itself it is drawn.',
          { minimum: MIN_BACKGROUND_LAYER_SCALE, maximum: MAX_BACKGROUND_LAYER_SCALE },
          (layer) => layer.scale,
          (layer, value) => {
            layer.scale = value;
          }
        ),
        layerField(
          'follow',
          'For a backdrop: how much it moves with the view, from 0 (fixed far away) to 100.',
          { minimum: 0, maximum: 100 },
          (layer) => percentOf(layer.follow),
          (layer, value) => {
            layer.cameraFollow = value / 100;
          }
        ),
        layerField(
          'backdrop_height',
          'For a backdrop: how high it stands, from 0 at the foot of the screen to 100 at its top.',
          { minimum: 0, maximum: 100 },
          (layer) => percentOf(layer.height),
          (layer, value) => {
            layer.backdropHeight = value / 100;
          }
        ),
      ],
      create: {
        access: 'write',
        description: `Adds a layer in front of the others of a table, drawn under the board until told otherwise. Give it a picture. A table holds at most ${MAX_TABLE_BACKGROUND_LAYERS}.`,
        input: objectInput({
          table: {
            type: 'string',
            maxLength: 200,
            description: 'The id or name of the table to add it to. Leave out for the table in view.',
          },
        }),
        make: (args) => {
          const reference = typeof args['table'] === 'string' ? args['table'] : '';
          const table = reference
            ? findOne(
                this.views.tables(),
                reference,
                (each) => each.identifier,
                (each) => each.name,
                'table'
              )
            : this.tabletop.currentTable;
          if (table.backgroundLayers.length >= MAX_TABLE_BACKGROUND_LAYERS) {
            throw new AgentToolError(
              'not_allowed',
              `The table ${table.name} already holds ${MAX_TABLE_BACKGROUND_LAYERS} background layers, as many as a table may.`
            );
          }
          const layer = new TableBackgroundLayer();
          layer.initialize();
          layer.order = this.nextLayerOrder(table);
          table.appendChild(layer);
          return layer;
        },
      },
      remove: { access: 'write', take: (layer) => layer.destroy() },
      actions: [
        {
          name: 'move_back',
          description: 'Draws it one place further back among the layers of its placement.',
          access: 'write',
          input: objectInput(),
          run: move(-1),
        },
        {
          name: 'move_forward',
          description: 'Draws it one place further forward among the layers of its placement.',
          access: 'write',
          input: objectInput(),
          run: move(1),
        },
      ],
    };
  }

  /** A ruler's end as the AI is told it: the square it is over, how high, and the piece it is held to. */
  private endRead(end: RulerEnd): Record<string, unknown> {
    const grid = this.readings.gridSize();
    const point = this.readings.pointOf(end) ?? end;
    const square = this.views.squareAt(point.x, point.y);
    const piece = end.piece ? this.objectStore.get<GameCharacter>(end.piece) : null;
    if (piece instanceof GameCharacter && this.views.sees(piece)) {
      return { piece: piece.identifier, square, height: twoPlaces((end.lift ?? 0) / grid) };
    }
    return { square, height: twoPlaces((point.z - this.standing.heightPxAt(point.x, point.y)) / grid) };
  }

  /** A ruler's end where the AI asks for it: held to a piece this seat sees, or in a square. */
  private endAt(given: AgentArgs): RulerEnd {
    const lift = (typeof given['height'] === 'number' ? given['height'] : 0) * this.readings.gridSize();
    const piece = typeof given['piece'] === 'string' ? given['piece'] : '';
    if (piece) return this.readings.endOnPiece(this.pieceNamed(piece), lift);
    const square = given['square'] as AgentSquare | undefined;
    if (!square) throw new AgentToolError('invalid_input', 'Give each end of the ruler a square or a piece.');
    const middle = this.middleOf(square);
    return { ...middle, z: this.standing.heightPxAt(middle.x, middle.y) + lift };
  }

  /** A ruler's line where the AI asks for it. */
  private lineAt(given: unknown): RulerLine {
    const ends = given as { from: AgentArgs; to: AgentArgs };
    return { from: this.endAt(ends.from), to: this.endAt(ends.to) };
  }

  private ruler(): AgentKind<TableRuler> {
    return {
      kind: TableRuler.aliasName,
      description:
        'A ruler left lying on the table for every seat, measuring between its two ends, each in a square or held to a piece. One whose end this seat cannot see is left out.',
      list: () => this.rulers.placed().map((placed) => placed.ruler),
      idOf: (ruler) => ruler.identifier,
      nameOf: (ruler) => ruler.name,
      fields: [
        {
          name: 'line',
          description: RULER_LINE.description!,
          schema: RULER_LINE,
          access: 'write',
          read: (ruler) => {
            const line = ruler.rulerLine;
            return line ? { from: this.endRead(line.from), to: this.endRead(line.to) } : null;
          },
          put: (ruler, value) => {
            ruler.rulerLine = this.lineAt(value);
          },
          refuse: (ruler, value) =>
            ruler.isLock
              ? 'This ruler is locked: its ends stay as they are until it is unlocked.'
              : refusalOf(() => this.lineAt(value)),
        },
        flagField<TableRuler>(
          'locked',
          'Whether its ends are kept as they are.',
          'write',
          (ruler) => ruler.isLock,
          (ruler, value) => {
            ruler.isLock = value;
          }
        ),
        {
          name: 'reading',
          description:
            'What it measures: the unit, the straight length, the length along the ground, the rise from the first end to the second, and the steps a piece takes.',
          schema: { type: 'object', properties: {}, additionalProperties: true },
          access: null,
          read: (ruler) => {
            const line = ruler.rulerLine;
            return (line && this.readings.measure(line)?.reading) ?? null;
          },
        },
      ],
      create: {
        access: 'write',
        description: 'Leaves a ruler lying on the table between two ends, for every seat.',
        input: objectInput({ from: RULER_END, to: RULER_END }, ['from', 'to']),
        make: (args) => this.rulers.place(this.lineAt(args)),
      },
      remove: { access: 'write', take: (ruler) => ruler.destroy() },
    };
  }

  private effectField(): AgentKind<EffectField> {
    const shownPreset = (field: EffectField) => this.effects.shownPreset(field.presetIdentifier);
    return {
      kind: EffectField.aliasName,
      description:
        'An effect left standing on the table, replaying its preset over and over, as a poison swamp or a wall of fire. The preset of one kept for the game master is left out for other seats, and one standing where the fog keeps the ground from this seat is not listed.',
      list: () => this.effectFields.shownFields().filter((field) => field.isVisibleOnTable),
      idOf: (field) => field.identifier,
      nameOf: (field) => shownPreset(field)?.name ?? '',
      fields: [
        textField<EffectField>(
          'preset',
          'The name of the effect it replays.',
          null,
          (field) => shownPreset(field)?.name
        ),
        {
          name: 'square',
          description: 'The square it stands in, counted from its north-west corner.',
          schema: SQUARE_SCHEMA,
          access: null,
          read: (field) => this.squares.at(field.location.x, field.location.y),
        },
        numberField<EffectField>('size', 'How many squares across it is.', null, {}, (field) => field.size),
      ],
      create: {
        access: 'write',
        description:
          'Leaves an effect standing where a piece stands, as the effect library does, or in a square. The effect must be one this seat is shown.',
        input: objectInput(
          {
            preset: { type: 'string', maxLength: 200, description: 'The id or name of the effect.' },
            piece: {
              type: 'string',
              maxLength: 200,
              description: 'The id or name of a piece this seat sees, to stand it where the piece stands.',
            },
            at: { ...SQUARE_SCHEMA, description: 'The square to stand it in, where no piece is given.' },
          },
          ['preset']
        ),
        make: (args) => {
          const preset = findOne(
            this.effects.shownPresets(),
            args['preset'] as string,
            (each) => each.identifier,
            (each) => each.name,
            'effect'
          );
          const piece = typeof args['piece'] === 'string' ? args['piece'] : '';
          if (piece) {
            const anchor = this.pieceNamed(piece);
            return this.effectFields.place(preset, anchor.location.x, anchor.location.y, anchor.posZ);
          }
          if (!args['at'])
            throw new AgentToolError('invalid_input', 'Give a piece or a square to stand the effect in.');
          const corner = this.cornerFor(args);
          const half = this.grid() / 2;
          return this.effectFields.place(
            preset,
            corner.x,
            corner.y,
            this.standing.heightPxAt(corner.x + half, corner.y + half)
          );
        },
      },
      remove: { access: 'write', take: (field) => this.effectFields.remove(field) },
    };
  }
}
