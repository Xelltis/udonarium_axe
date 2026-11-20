import { inject, Injectable } from '@angular/core';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { guardPressedGround } from '@axe/application/tabletop/functional-paint.service';
import { GameTableService } from '@axe/application/tabletop/game-table.service';
import { TableTriggerService } from '@axe/application/tabletop/table-trigger.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { AgentObjectSchema, AgentSchema } from '@axe/core/agent/agent-schema';
import type { AgentAccess } from '@axe/core/agent/agent-tools';
import { triggerUpdateGameObject } from '@axe/core/event/domain-events';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ambienceDensityOf, SKY_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import { CutIn } from '@axe/domain/media/cut-in';
import { ImageTag } from '@axe/domain/media/image-tag';
import { tableBgmModeOf } from '@axe/domain/media/table-bgm';
import { encodeCutInIdentifiers, parseCutInIdentifiers } from '@axe/domain/media/table-cut-in';
import { BoardSwitch, switchOf } from '@axe/domain/tabletop/board-switch/board-switch';
import { BoardStash } from '@axe/domain/tabletop/board-switch/concealment';
import {
  encodeSwitchDefinition,
  MAX_SWITCH_ACTIONS,
  MAX_SWITCH_RANGE,
  parseSwitchDefinition,
  SWITCH_ACTION_KINDS,
  SWITCH_SPEAKERS,
  type SwitchDefinition,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import { type CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { ensureFogMemoryOn, FogMemory, fogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { asFogMode, FOG_MODES } from '@axe/domain/tabletop/fog/fog-mode';
import { FilterType, GameTable, GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { copyGameTable, freeTableName } from '@axe/domain/tabletop/game-table-copy';
import {
  GROUND_CHUNK_SAMPLES,
  GROUND_HEIGHT_STEP,
  GROUND_SAMPLES_PER_CELL,
} from '@axe/domain/tabletop/ground/ground-chunk-data';
import { GroundChunk, groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { MoveBlockMap, moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { MAX_SQUARE_SPAN, squareSpanOf } from '@axe/domain/tabletop/move/move-grid';
import { MAX_CELL_PX, MIN_CELL_PX } from '@axe/domain/tabletop/rescale-table-contents';
import { SHOWN_TO } from '@axe/domain/tabletop/shown-to';
import { foregroundFitOf, foregroundOpacityOf, TABLE_FOREGROUND_FITS } from '@axe/domain/tabletop/table-foreground';
import { MOST_MOVE_COST_EXTRA, moveCostsOn, TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { tableSkyKindOf } from '@axe/domain/tabletop/table-sky';
import { TableTrigger, triggerEffectLine, triggersOn } from '@axe/domain/tabletop/table-trigger';
import { Terrain } from '@axe/domain/tabletop/terrain';
import {
  isPressMoment,
  readSpentBy,
  TRIGGER_MOMENTS,
  TRIGGER_REPEATS,
  TRIGGER_TARGETS,
} from '@axe/domain/tabletop/trigger-event';
import { EngagementZone } from '@axe/domain/tabletop/zone/engagement-zone';
import { findOne } from '@axe/features/agent-tools/agent-lookup';
import {
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
import { SQUARE_SCHEMA } from '@axe/features/agent-tools/kinds/agent-squares.service';

/** A block of cells of the table, from the cell at its north-west corner. */
const AREA: AgentSchema = {
  type: 'object',
  description:
    'A block of cells of the table: col and row of its north-west cell counted from 1, and how many cells wide and tall it is.',
  properties: {
    col: { type: 'integer', minimum: 1 },
    row: { type: 'integer', minimum: 1 },
    width: { type: 'integer', minimum: 1, maximum: 200 },
    height: { type: 'integer', minimum: 1, maximum: 200 },
  },
  required: ['col', 'row', 'width', 'height'],
  additionalProperties: false,
};

/** A block of cells, as an AI names one. */
interface AgentArea {
  readonly col: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
}

/** What a thing laid on the table in cells keeps of where it lies. */
interface CellBlock {
  col: number;
  row: number;
  width: number;
  height: number;
}

/** How wide and tall the table settings panel lets a table be, in cells. */
const MOST_TABLE_CELLS = 100;

/** How tall the table settings panel lets a table's walls stand. */
const MOST_WALL_HEIGHT = 20;

/** The fewest a zone may be set to hold, as a piece's zone menu offers, and the most. */
const FEWEST_ZONE_LIMIT = 2;
const MOST_ZONE_LIMIT = 20;

/** How many cells one chunk of the raised ground covers along each side. */
const GROUND_CHUNK_CELLS = GROUND_CHUNK_SAMPLES / GROUND_SAMPLES_PER_CELL;

/** The grid types, as the AI names them. */
const GRID_TYPES = ['none', 'square', 'hex_vertical', 'hex_horizontal'] as const;
const GRID_TYPE_OF: Readonly<Record<(typeof GRID_TYPES)[number], GridType>> = {
  none: GridType.NONE,
  square: GridType.SQUARE,
  hex_vertical: GridType.HEX_VERTICAL,
  hex_horizontal: GridType.HEX_HORIZONTAL,
};

/** How pieces snap to the grid, as the table settings panel's one dropdown offers it. */
const SNAP_MODES = ['off', 'center', 'vertex', 'both', 'all', 'grid'] as const;
const SNAP_STYLE_OF: Readonly<Record<Exclude<(typeof SNAP_MODES)[number], 'off'>, GridSnapStyle>> = {
  center: GridSnapStyle.CENTER,
  vertex: GridSnapStyle.VERTEX,
  both: GridSnapStyle.BOTH,
  all: GridSnapStyle.ALL,
  grid: GridSnapStyle.GRID,
};

/** The filter over the distant view, as the AI names it. */
const FILTERS = ['none', 'white', 'black'] as const;
const FILTER_OF: Readonly<Record<(typeof FILTERS)[number], FilterType>> = {
  none: FilterType.NONE,
  white: FilterType.WHITE,
  black: FilterType.BLACK,
};

/** What a table shows past its board, as the AI names it. */
const SKIES = ['picture', 'clock'] as const;

/** The weather over a whole table, as the AI names it. */
const WEATHERS = ['none', ...SKY_AMBIENCE_KINDS] as const;

/** The four walls of a table and what the table keeps for each. */
const WALLS = [
  { side: 'north', image: 'northWallImageIdentifier', shown: 'showNorthWall' },
  { side: 'east', image: 'eastWallImageIdentifier', shown: 'showEastWall' },
  { side: 'south', image: 'southWallImageIdentifier', shown: 'showSouthWall' },
  { side: 'west', image: 'westWallImageIdentifier', shown: 'showWestWall' },
] as const;

/** What the master has put out of sight, as the one thing of its kind the AI acts on. */
const STASH = { identifier: 'board-stash' } as const;

/** What a table's music is told to do on being switched to, besides putting a track on. */
const MUSIC_LEFT_OR_STOPPED: readonly string[] = ['', 'leave', 'stop'];

/** A colour as the table settings panel's pickers write one. */
const COLOUR = /^#[0-9a-f]{6}$/i;

/** Why a value is not a colour for a field, or null where it is one, or empty where empty is let through. */
function colourRefusal(name: string, value: unknown, emptyAllowed = false): string | null {
  const text = String(value);
  if (COLOUR.test(text) || (emptyAllowed && text.length < 1)) return null;
  return `${name} must be a colour written #rrggbb${emptyAllowed ? ', or empty' : ''}.`;
}

/** A field of a colour written #rrggbb, written by a seat with the access given. */
function colourField<T>(
  name: string,
  description: string,
  access: AgentAccess | null,
  read: (object: T) => string,
  put: (object: T, colour: string) => void
): AgentKindField<T> {
  return {
    ...textField<T>(
      name,
      `${description} Written #rrggbb.`,
      access,
      read,
      (object, value) => put(object, value.toLowerCase()),
      7
    ),
    refuse: (_object, value) => colourRefusal(name, value),
  };
}

/** Why a lookup by id or name finds nothing to take, or null where it finds the one thing. */
function lookupRefusal(lookup: () => unknown): string | null {
  try {
    lookup();
    return null;
  } catch (error) {
    if (error instanceof AgentToolError) return error.message;
    throw error;
  }
}

/** A field of a share from 0 to 1, given and read as a whole percentage. */
function percentField<T>(
  name: string,
  description: string,
  access: AgentAccess | null,
  minimum: number,
  read: (object: T) => number,
  put: (object: T, fraction: number) => void
): AgentKindField<T> {
  return numberField<T>(
    name,
    `${description} As a percentage.`,
    access,
    { minimum, maximum: 100, integer: true },
    (object) => Math.round(read(object) * 100),
    (object, value) => put(object, value / 100)
  );
}

/** The block of cells a thing laid in cells covers, as the AI names one. */
function areaOf(block: { readonly rect: CellBlock }): AgentArea {
  const rect = block.rect;
  return { col: rect.col + 1, row: rect.row + 1, width: rect.width, height: rect.height };
}

/** Lays a thing over the block of cells the AI named. */
function placeArea(block: CellBlock, area: AgentArea): void {
  block.col = area.col - 1;
  block.row = area.row - 1;
  block.width = area.width;
  block.height = area.height;
}

/** Whole numbers written as runs, as `3-5, 9`. */
function runsOf(numbers: readonly number[]): string {
  const runs: string[] = [];
  let start = -1;
  let last = -1;
  for (const number of numbers) {
    if (number === last + 1 && start >= 0) {
      last = number;
      continue;
    }
    if (start >= 0) runs.push(start === last ? `${start}` : `${start}-${last}`);
    start = last = number;
  }
  if (start >= 0) runs.push(start === last ? `${start}` : `${start}-${last}`);
  return runs.join(', ');
}

/** The grid of a table's own cells, which what is painted on it is laid over. */
function boardGridOf(table: GameTable): CellGrid {
  return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
}

/** The schema of an object's one text argument naming a thing by id or name. */
function namedInput(name: string, description: string): AgentObjectSchema {
  return objectInput({ [name]: { type: 'string', maxLength: 200, description } }, [name]);
}

/**
 * The kinds of the tables themselves and what the map editor and the game master lay on them: triggers, move
 * costs, switches, what is put out of sight, the fog, the engagement zones and the ground, as the AI link's generic tools offer them.
 *
 * Everything but the tables is the table in view's, as the screen's own services read it: the map editor
 * paints and the overlays draw only the table everyone is looking at, which switch_table changes.
 */
@Injectable({ providedIn: 'root' })
export class AgentMapKinds {
  private readonly views = inject(AgentViews);
  private readonly tabletop = inject(TabletopService);
  private readonly tables = inject(GameTableService);
  private readonly permission = inject(RolePermissionService);
  private readonly vision = inject(VisionService);
  private readonly images = inject(ImageService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly objectStore = inject(ObjectStore);
  private readonly triggers = inject(TableTriggerService);
  private readonly switches = inject(BoardSwitchService);
  private readonly concealment = inject(ConcealmentService);
  private readonly zones = inject(EngagementZoneService);
  private readonly t = inject(TRANSLATE_FN);

  readonly kinds: readonly AnyAgentKind[] = [
    anyKind(this.gameTable()),
    anyKind(this.tableTrigger()),
    anyKind(this.moveCost()),
    anyKind(this.boardSwitch()),
    anyKind(this.boardStash()),
    anyKind(this.fogMemory()),
    anyKind(this.engagementZone()),
    anyKind(this.moveBlockMap()),
    anyKind(this.groundChunk()),
  ];

  /** The table everyone is looking at, or a refusal where the room has none. */
  private viewTable(): GameTable {
    const table = TableSelecter.instance.viewTable;
    if (!table) throw new AgentToolError('failed', 'There is no table in view.');
    return table;
  }

  /** Whether this seat is shown a cell of a table, as the screen shows it (see `VisionService.isCellShown`). */
  private seesCell(grid: CellGrid, col: number, row: number): boolean {
    return this.vision.isCellShown(grid, cellIndexOf(grid, col, row));
  }

  /** Whether this seat is shown a block laid on the table in view, as the screen shows it (see `VisionService.isGroundShown`). */
  private seesBlock(table: GameTable, rect: CellBlock): boolean {
    return this.vision.isGroundShown(boardGridOf(table), rect);
  }

  /** A field read by the game master's seat alone, and left out for every other. */
  private kept<T>(field: AgentKindField<T>): AgentKindField<T> {
    return { ...field, read: (object) => (this.permission.isGameMaster() ? field.read(object) : undefined) };
  }

  /** The id of a picture as a table keeps it, or empty where it names none the room has. */
  private pictureId(identifier: string): string {
    const image = this.images.getEmptyOr(identifier);
    return image.isEmpty ? '' : image.identifier;
  }

  /** A field of a picture, given by the id or name of one this seat may browse, or empty for none. */
  private pictureField<T>(
    name: string,
    description: string,
    access: AgentAccess,
    none: string,
    read: (object: T) => string,
    put: (object: T, identifier: string) => void
  ): AgentKindField<T> {
    return {
      ...textField<T>(
        name,
        `${description} An image's id or name; empty for none.`,
        access,
        (object) => this.pictureId(read(object)),
        (object, value) => {
          const wanted = value.trim();
          put(object, wanted.length < 1 ? none : this.imageNamed(wanted).identifier);
        },
        200
      ),
      refuse: (_object, value) => {
        const wanted = String(value).trim();
        return wanted.length < 1 ? null : lookupRefusal(() => this.imageNamed(wanted));
      },
    };
  }

  /** The picture an id or name gives, among those the image picker offers this seat. */
  private imageNamed(reference: string): ImageFile {
    return findOne(
      ImageTag.searchImages([], this.tagLock.sight()),
      reference,
      (each) => each.identifier,
      (each) => each.name,
      'image'
    );
  }

  private gameTable(): AgentKind<GameTable> {
    const redraw = (table: GameTable) => triggerUpdateGameObject(table.toContext());
    const cutIns = () => this.objectStore.getObjects<CutIn>(CutIn);
    const cutInNamed = (reference: string) =>
      findOne(
        cutIns(),
        reference,
        (cutIn) => cutIn.identifier,
        (cutIn) => cutIn.name,
        'cut-in'
      );
    const trackNamed = (reference: string) =>
      findOne(
        this.audioStorage.audios.filter((audio) => !audio.isHidden),
        reference,
        (audio) => audio.identifier,
        (audio) => audio.name,
        'track'
      );
    return {
      kind: GameTable.aliasName,
      description:
        'A table of the room: a board of cells with its pictures, grid, walls, light, fog and weather. Pieces stand on every table at once; the one in view is the one everyone looks at, which switch_table changes. Any table may be changed here, in view or not.',
      list: () => this.views.tables(),
      idOf: (table) => table.identifier,
      nameOf: (table) => table.name,
      fields: [
        flagField<GameTable>(
          'in_view',
          'Whether it is the table everyone is looking at.',
          null,
          (table) => table.identifier === TableSelecter.instance.viewTableIdentifier
        ),
        textField<GameTable>(
          'name',
          'Its name.',
          'write',
          (table) => table.name,
          (table, value) => {
            table.name = value;
          },
          200
        ),
        numberField<GameTable>(
          'width',
          'How many cells wide the board is.',
          'write',
          { minimum: 1, maximum: MOST_TABLE_CELLS, integer: true },
          (table) => table.width,
          (table, value) => {
            table.width = value;
          }
        ),
        numberField<GameTable>(
          'height',
          'How many cells tall the board is.',
          'write',
          { minimum: 1, maximum: MOST_TABLE_CELLS, integer: true },
          (table) => table.height,
          (table, value) => {
            table.height = value;
          }
        ),
        numberField<GameTable>(
          'cell_size',
          'How wide one cell is drawn, in pixels. Changing it scales what stands on the table so it keeps to its cells.',
          'write',
          { minimum: MIN_CELL_PX, maximum: MAX_CELL_PX, integer: true },
          (table) => Number(table.gridSize),
          (table, value) => this.tabletop.changeCellSize(table, value)
        ),
        this.pictureField<GameTable>(
          'picture',
          'The picture the board is drawn with.',
          'write',
          ImageFile.Empty.identifier,
          (table) => table.imageIdentifier,
          (table, identifier) => {
            table.imageIdentifier = identifier;
          }
        ),
        this.pictureField<GameTable>(
          'background_picture',
          'The picture of the distant view behind the board.',
          'write',
          ImageFile.Empty.identifier,
          (table) => table.backgroundImageIdentifier,
          (table, identifier) => {
            table.backgroundImageIdentifier = identifier;
          }
        ),
        choiceField<GameTable, (typeof FILTERS)[number]>(
          'background_filter',
          'The tint laid over the distant view.',
          'write',
          FILTERS,
          (table) => FILTERS.find((name) => FILTER_OF[name] === table.backgroundFilterType) ?? 'none',
          (table, value) => {
            table.backgroundFilterType = FILTER_OF[value];
          }
        ),
        this.pictureField<GameTable>(
          'foreground_picture',
          'The picture laid over the whole view, in front of the board and everything on it, such as a window frame or mist.',
          'write',
          '',
          (table) => table.foregroundImageIdentifier,
          (table, identifier) => {
            table.foregroundImageIdentifier = identifier;
          }
        ),
        percentField<GameTable>(
          'foreground_opacity',
          'How opaque the picture in front is.',
          'write',
          5,
          (table) => foregroundOpacityOf(table.foregroundOpacity),
          (table, fraction) => {
            table.foregroundOpacity = foregroundOpacityOf(fraction);
          }
        ),
        choiceField<GameTable, (typeof TABLE_FOREGROUND_FITS)[number]>(
          'foreground_fit',
          'How the picture in front is fitted to the screen.',
          'write',
          TABLE_FOREGROUND_FITS,
          (table) => foregroundFitOf(table.foregroundFit),
          (table, value) => {
            table.foregroundFit = value;
          }
        ),
        choiceField<GameTable, (typeof SKIES)[number]>(
          'sky',
          'What shows past the board where the camera looks over it: the distant view picture, or a sky that turns with the story clock.',
          'write',
          SKIES,
          (table) => (tableSkyKindOf(table.skyKind) === 'clock' ? 'clock' : 'picture'),
          (table, value) => {
            table.skyKind = value === 'clock' ? 'clock' : '';
          }
        ),
        choiceField<GameTable, (typeof GRID_TYPES)[number]>(
          'grid_type',
          'Whether the board has no grid, a grid of squares, or one of hexes standing on a point (vertical) or a side (horizontal).',
          'write',
          GRID_TYPES,
          (table) => GRID_TYPES.find((name) => GRID_TYPE_OF[name] === Number(table.gridType)) ?? 'square',
          (table, value) => {
            table.gridType = GRID_TYPE_OF[value];
          }
        ),
        colourField<GameTable>(
          'grid_colour',
          'The colour of the grid lines.',
          'write',
          (table) => table.gridColor.substring(0, 7),
          (table, colour) => {
            table.gridColor = `${colour}e6`;
          }
        ),
        colourField<GameTable>(
          'grid_label_colour',
          'The colour of the cell labels.',
          'write',
          (table) => table.gridFontColor.substring(0, 7),
          (table, colour) => {
            table.gridFontColor = `${colour}e6`;
          }
        ),
        flagField<GameTable>(
          'grid_shown',
          'Whether the grid lines are drawn.',
          'write',
          (table) => table.gridShow,
          (table, value) => {
            table.gridShow = value;
            redraw(table);
          }
        ),
        choiceField<GameTable, (typeof SNAP_MODES)[number]>(
          'snap',
          'Where a piece let go of settles: nowhere (off), the middle of a cell, its corners, both, every one of those, or the cell of the square it is put in (grid).',
          'write',
          SNAP_MODES,
          (table) =>
            table.gridSnap
              ? ((Object.keys(SNAP_STYLE_OF) as (keyof typeof SNAP_STYLE_OF)[]).find(
                  (mode) => SNAP_STYLE_OF[mode] === Number(table.gridSnapStyle)
                ) ?? 'center')
              : 'off',
          (table, value) => {
            if (value === 'off') {
              table.gridSnap = false;
              return;
            }
            table.gridSnap = true;
            table.gridSnapStyle = SNAP_STYLE_OF[value];
          }
        ),
        {
          ...numberField<GameTable>(
            'square_span',
            'How many cells across one square is, for moving pieces and counting ranges: 1 counts every cell. Square grids only.',
            'write',
            { minimum: 1, maximum: MAX_SQUARE_SPAN, integer: true },
            (table) => squareSpanOf(table),
            (table, value) => {
              table.squareSpan = value;
            }
          ),
          refuse: (table) =>
            Number(table.gridType) === GridType.SQUARE
              ? null
              : 'Only a grid of squares puts cells together into squares.',
        },
        flagField<GameTable>(
          'recommends_flat',
          'Whether the table asks to be looked down on flat rather than in perspective. A reader who chose a view of their own keeps it. The table settings panel lets any seat but a guest set this, as here.',
          'write',
          (table) => table.mode2d,
          (table, value) => {
            table.mode2d = value;
            redraw(table);
          }
        ),
        flagField<GameTable>(
          'image_billboard',
          "Whether a piece's picture keeps facing the reader in 3D. The game master's to set, as the room settings have it.",
          'gm',
          (table) => table.imageBillboard,
          (table, value) => {
            table.imageBillboard = value;
            redraw(table);
          }
        ),
        flagField<GameTable>(
          'magnetic_anomaly',
          'Whether a compass wanders on this table rather than finding north.',
          'write',
          (table) => table.magneticAnomaly,
          (table, value) => {
            table.magneticAnomaly = value;
          }
        ),
        numberField<GameTable>(
          'wall_height',
          'How tall the walls round the board stand, in cells.',
          'write',
          { minimum: 1, maximum: MOST_WALL_HEIGHT, integer: true },
          (table) => table.wallHeight,
          (table, value) => {
            table.wallHeight = value;
          }
        ),
        ...WALLS.flatMap((wall) => [
          this.pictureField<GameTable>(
            `${wall.side}_wall_picture`,
            `The picture on the ${wall.side} wall.`,
            'write',
            ImageFile.Empty.identifier,
            (table) => table[wall.image],
            (table, identifier) => {
              table[wall.image] = identifier;
            }
          ),
          flagField<GameTable>(
            `${wall.side}_wall_shown`,
            `Whether the ${wall.side} wall stands.`,
            'write',
            (table) => table[wall.shown],
            (table, value) => {
              table[wall.shown] = value;
            }
          ),
        ]),
        flagField<GameTable>(
          'darkness',
          'Whether the table is dark, so only what is lit shows.',
          'write',
          (table) => table.darknessEnabled,
          (table, value) => {
            table.darknessEnabled = value;
          }
        ),
        percentField<GameTable>(
          'darkness_level',
          'How dark the darkness is.',
          'write',
          0,
          (table) => table.darknessLevel,
          (table, fraction) => {
            table.darknessLevel = fraction;
          }
        ),
        colourField<GameTable>(
          'ambient_colour',
          'The colour the darkness, and the shadows cast in the light, are painted in.',
          'write',
          (table) => table.ambientColor,
          (table, colour) => {
            table.ambientColor = colour;
          }
        ),
        percentField<GameTable>(
          'global_illumination',
          'How much light reaches everywhere regardless of lights.',
          'write',
          0,
          (table) => table.globalIllumination,
          (table, fraction) => {
            table.globalIllumination = fraction;
          }
        ),
        flagField<GameTable>(
          'light_snap',
          'Whether lights set down on the table snap to its grid.',
          'write',
          (table) => table.lightSnapToGrid,
          (table, value) => {
            table.lightSnapToGrid = value;
          }
        ),
        flagField<GameTable>(
          'fog',
          'Whether fog of war covers the table, ground nobody has explored staying hidden from the players.',
          'write',
          (table) => table.fogEnabled,
          (table, value) => {
            table.fogEnabled = value;
          }
        ),
        choiceField<GameTable, (typeof FOG_MODES)[number]>(
          'fog_mode',
          'How strict the fog of war is.',
          'write',
          FOG_MODES,
          (table) => asFogMode(table.fogMode),
          (table, value) => {
            table.fogMode = value;
          }
        ),
        colourField<GameTable>(
          'fog_colour',
          'The colour of the fog of war.',
          'write',
          (table) => table.fogColor,
          (table, colour) => {
            table.fogColor = colour;
          }
        ),
        choiceField<GameTable, (typeof WEATHERS)[number]>(
          'weather',
          'The weather over the whole table.',
          'write',
          WEATHERS,
          (table) => (WEATHERS as readonly string[]).find((kind) => kind === table.weatherKind) ?? 'none',
          (table, value) => {
            table.weatherKind = value === 'none' ? '' : value;
          }
        ),
        {
          ...textField<GameTable>(
            'weather_colour',
            "The colour of the weather, written #rrggbb; empty for the weather's own colour.",
            'write',
            (table) => table.weatherColor,
            (table, value) => {
              table.weatherColor = value.toLowerCase();
            },
            7
          ),
          refuse: (_table, value) => colourRefusal('weather_colour', value, true),
        },
        percentField<GameTable>(
          'weather_density',
          'How thick the weather is.',
          'write',
          0,
          (table) => ambienceDensityOf(table.weatherDensity),
          (table, fraction) => {
            table.weatherDensity = fraction;
          }
        ),
        {
          name: 'cut_ins_on_show',
          description:
            'The cut-ins, by id or name, one of which is drawn and played when the table is switched to. Empty for none.',
          schema: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 20 },
          access: 'write',
          read: (table) => {
            const known = new Set(cutIns().map((cutIn) => cutIn.identifier));
            return parseCutInIdentifiers(table.cutInIdentifiers).filter((identifier) => known.has(identifier));
          },
          refuse: (_table, value) =>
            (value as string[]).map((reference) => lookupRefusal(() => cutInNamed(reference))).find(Boolean) ?? null,
          put: (table, value) => {
            const named = (value as string[]).map((reference) => cutInNamed(reference).identifier);
            table.cutInIdentifiers = encodeCutInIdentifiers(named);
          },
        },
        {
          ...textField<GameTable>(
            'music_on_show',
            'What the music does when the table is switched to: "leave" leaves it, "stop" stops it, or the id or name of a track to put on.',
            'write',
            (table) => {
              const mode = tableBgmModeOf(table);
              return mode === 'play' ? table.tableBgmIdentifier : mode === 'stop' ? 'stop' : 'leave';
            },
            (table, value) => {
              const wanted = value.trim();
              if (MUSIC_LEFT_OR_STOPPED.includes(wanted)) {
                table.tableBgm = wanted === 'stop' ? 'stop' : '';
                table.tableBgmIdentifier = '';
                return;
              }
              table.tableBgm = 'play';
              table.tableBgmIdentifier = trackNamed(wanted).identifier;
            },
            200
          ),
          refuse: (_table, value) => {
            const wanted = String(value).trim();
            return MUSIC_LEFT_OR_STOPPED.includes(wanted) ? null : lookupRefusal(() => trackNamed(wanted));
          },
        },
      ],
      create: {
        access: 'write',
        description:
          'Makes a new table of 20 by 20 cells with no picture and its grid drawn, as the table settings panel does. It is not switched to; switch_table does that.',
        input: objectInput(),
        make: () => {
          const table = new GameTable();
          table.name = this.t('feature.tabletop.tableSetting.defaultName');
          table.imageIdentifier = ImageFile.Empty.identifier;
          table.gridShow = true;
          table.initialize();
          return table;
        },
      },
      remove: {
        access: 'write',
        take: (table) => {
          if (!this.tables.remove(table)) {
            throw new AgentToolError('not_allowed', 'The last table cannot be taken away; make another first.');
          }
        },
      },
      actions: [
        {
          name: 'duplicate',
          description:
            'Copies the table with everything laid on it under a name no table has yet, as the table settings panel does. The copy is not switched to.',
          access: 'write',
          input: objectInput({
            name: {
              type: 'string',
              maxLength: 200,
              description: 'The name wanted for the copy. Leave out for "copy of".',
            },
          }),
          run: (table, args) => {
            const given = typeof args['name'] === 'string' ? args['name'].trim() : '';
            const wanted = given || this.t('feature.tabletop.tableSetting.copyName', { name: table.name });
            const name = freeTableName(
              wanted,
              this.views.tables().map((each) => each.name)
            );
            const copy = copyGameTable(table, name);
            if (!copy) throw new AgentToolError('failed', `${table.name} could not be copied.`);
            return { made: { id: copy.identifier, name: copy.name } };
          },
        },
      ],
    };
  }

  /** What is drawn on a trigger's ground for a seat shown it: its name, and the word to press it. */
  private drawnTriggerName(trigger: TableTrigger): string {
    const pressed = trigger.pressSwitch;
    return (pressed ? pressed.def.label.trim() : '') || trigger.name.trim();
  }

  /** Whether a trigger is drawn as spent: put away or pressed its once where it is pressed, sprung its once otherwise. */
  private drawnTriggerSpent(trigger: TableTrigger): boolean {
    const pressed = trigger.pressSwitch;
    if (pressed) return pressed.retired || (pressed.def.repeat === 'once' && Boolean(pressed.spent));
    return trigger.repeats === 'once' && trigger.spent;
  }

  /**
   * Turns a trigger to go off at a moment. Ground turned to be pressed is written down as spent for older
   * versions and gets a switch, as the map editor lays it; ground turned back loses its switch and is
   * written as freshly laid ground.
   */
  private setMoment(trigger: TableTrigger, moment: (typeof TRIGGER_MOMENTS)[number]): void {
    const wasPressed = isPressMoment(trigger.firesOn);
    const pressed = isPressMoment(moment);
    trigger.moment = moment;
    if (pressed && !wasPressed) {
      guardPressedGround(trigger);
      this.switches.ensure(trigger);
    }
    if (!pressed && wasPressed) {
      this.switches.remove(trigger);
      trigger.once = false;
      trigger.repeat = '';
      trigger.spent = false;
      trigger.spentBy = '';
      trigger.spentRound = -1;
    }
  }

  private tableTrigger(): AgentKind<TableTrigger> {
    const text = (
      name: string,
      description: string,
      read: (trigger: TableTrigger) => string,
      put: (trigger: TableTrigger, value: string) => void,
      maxLength = 200
    ) => this.kept(textField<TableTrigger>(name, description, 'gm', read, put, maxLength));
    const tableNamed = (reference: string) =>
      findOne(
        this.views.tables(),
        reference,
        (table) => table.identifier,
        (table) => table.name,
        'table'
      );
    return {
      kind: TableTrigger.aliasName,
      description:
        'Ground on the table in view that does something to whoever walks onto it, or presses it: takes from a resource, leaves a state, asks for a roll, plays something, carries them away. Laid by the game master. A seat that is not the master lists only the ground it is shown and reads only what is drawn on it: its name, its cells, its colour, whether it is spent and the words on it.',
      list: () => this.triggers.shown(),
      idOf: (trigger) => trigger.identifier,
      nameOf: (trigger) => this.drawnTriggerName(trigger),
      fields: [
        textField<TableTrigger>(
          'name',
          'What it is called, which is written on its ground. Ground that is pressed shows the label of its board-switch in its place, where that has one.',
          'gm',
          (trigger) => (this.permission.isGameMaster() ? trigger.name : this.drawnTriggerName(trigger)),
          (trigger, value) => {
            trigger.name = value;
          },
          200
        ),
        {
          name: 'area',
          description: 'The cells it covers.',
          schema: AREA,
          access: 'gm',
          read: (trigger) => areaOf(trigger),
          put: (trigger, value) => placeArea(trigger, value as AgentArea),
        },
        colourField<TableTrigger>(
          'colour',
          'The colour its ground is drawn in.',
          'gm',
          (trigger) => trigger.color,
          (trigger, colour) => {
            trigger.color = colour;
          }
        ),
        flagField<TableTrigger>('spent', 'Whether it is drawn as spent, with nothing left in it.', null, (trigger) =>
          this.drawnTriggerSpent(trigger)
        ),
        textField<TableTrigger>('on_the_ground', 'The words written on its ground under its name.', null, (trigger) =>
          trigger.pressSwitch ? this.t('feature.boardSwitch.pressHere') : triggerEffectLine(trigger)
        ),
        this.kept(
          choiceField<TableTrigger, (typeof TRIGGER_MOMENTS)[number]>(
            'moment',
            'When it goes off: as a walk ends on it (stop), the moment it is stepped on (enter), as a turn starts or ends on it, or when somebody presses it (press). Ground that is pressed gets a board-switch, which says what pressing it does.',
            'gm',
            TRIGGER_MOMENTS,
            (trigger) => trigger.firesOn,
            (trigger, value) => this.setMoment(trigger, value)
          )
        ),
        this.kept(
          choiceField<TableTrigger, (typeof TRIGGER_TARGETS)[number]>(
            'targets',
            "Whose pieces it acts on: everyone's, the players' (pc) or the game master's (npc).",
            'gm',
            TRIGGER_TARGETS,
            (trigger) => trigger.catches,
            (trigger, value) => {
              trigger.targets = value;
            }
          )
        ),
        this.kept({
          ...choiceField<TableTrigger, (typeof TRIGGER_REPEATS)[number]>(
            'repeat',
            'How often it goes off: always, once, once for each piece, or once a round.',
            'gm',
            TRIGGER_REPEATS,
            (trigger) => (trigger.pressSwitch ? trigger.pressSwitch.def.repeat : trigger.repeats),
            (trigger, value) => {
              if (isPressMoment(trigger.firesOn)) return;
              trigger.repeat = value;
              trigger.once = value === 'once';
            }
          ),
          refuse: (trigger) =>
            isPressMoment(trigger.firesOn)
              ? 'Ground that is pressed goes off as often as its board-switch says; change the repeat of that.'
              : null,
        }),
        this.kept(
          choiceField<TableTrigger, (typeof SHOWN_TO)[number]>(
            'shown_to',
            'Who its ground is drawn for: the game master only, whoever can see it, or the whole room.',
            'gm',
            SHOWN_TO,
            (trigger) => trigger.shows,
            (trigger, value) => {
              trigger.shownTo = value;
              trigger.open = value === 'room';
            }
          )
        ),
        this.kept(
          flagField<TableTrigger>(
            'reveals',
            'Whether going off shows its ground to the room, a trap giving itself away.',
            'gm',
            (trigger) => trigger.reveals,
            (trigger, value) => {
              trigger.reveals = value;
            }
          )
        ),
        text(
          'say',
          'A line written in the chat as it goes off, in place of saying only that it did.',
          (trigger) => trigger.say,
          (trigger, value) => {
            trigger.say = value;
          },
          2000
        ),
        this.kept(
          flagField<TableTrigger>(
            'silent',
            'Whether what it says is kept back from the room, for the game master to read.',
            'gm',
            (trigger) => trigger.silent,
            (trigger, value) => {
              trigger.silent = value;
            }
          )
        ),
        text(
          'element',
          'The resource of the piece it takes from, by name.',
          (trigger) => trigger.element,
          (trigger, value) => {
            trigger.element = value;
          }
        ),
        text(
          'amount',
          'How much it takes: a number or dice such as 2d6; a negative number gives instead.',
          (trigger) => trigger.amount,
          (trigger, value) => {
            trigger.amount = value;
          }
        ),
        text(
          'ailment',
          'The state it leaves a piece in, by the name the room keeps it under.',
          (trigger) => trigger.ailment,
          (trigger, value) => {
            trigger.ailment = value;
          }
        ),
        this.kept(
          numberField<TableTrigger>(
            'ailment_rounds',
            'How many rounds that state lasts; 0 leaves it to the room.',
            'gm',
            { minimum: 0, maximum: 999, integer: true },
            (trigger) => trigger.ailmentRounds,
            (trigger, value) => {
              trigger.ailmentRounds = value;
            }
          )
        ),
        text(
          'check',
          'The roll it asks of whoever walks into it, such as a save.',
          (trigger) => trigger.check,
          (trigger, value) => {
            trigger.check = value;
          }
        ),
        text(
          'check_target',
          'What that roll has to reach; empty asks without naming a number.',
          (trigger) => trigger.checkTarget,
          (trigger, value) => {
            trigger.checkTarget = value;
          }
        ),
        text(
          'check_roll',
          'Dice it throws itself in place of asking, with check_target to reach.',
          (trigger) => trigger.checkRoll,
          (trigger, value) => {
            trigger.checkRoll = value;
          }
        ),
        text(
          'pass_amount',
          'What it takes from somebody who made the roll: empty for nothing, "half" for half.',
          (trigger) => trigger.passAmount,
          (trigger, value) => {
            trigger.passAmount = value;
          }
        ),
        text(
          'effect',
          'The effect played on whoever sets it off, by name.',
          (trigger) => trigger.effect,
          (trigger, value) => {
            trigger.effect = value;
          }
        ),
        text(
          'sound',
          'The sound it makes as it goes off, by the name of the audio.',
          (trigger) => trigger.sound,
          (trigger, value) => {
            trigger.sound = value;
          }
        ),
        text(
          'cut_in',
          'The cut-in played as it goes off, by name.',
          (trigger) => trigger.cutIn,
          (trigger, value) => {
            trigger.cutIn = value;
          }
        ),
        this.kept(
          flagField<TableTrigger>(
            'warps',
            'Whether it carries whoever ends a walk on it away to warp_to.',
            'gm',
            (trigger) => trigger.warps,
            (trigger, value) => {
              trigger.warps = value;
            }
          )
        ),
        this.kept({
          name: 'warp_to',
          description: 'The cell it carries them to.',
          schema: SQUARE_SCHEMA,
          access: 'gm',
          read: (trigger) => ({ col: trigger.warpCol + 1, row: trigger.warpRow + 1 }),
          put: (trigger, value) => {
            const square = value as { col: number; row: number };
            trigger.warpCol = square.col - 1;
            trigger.warpRow = square.row - 1;
          },
        }),
        {
          ...text(
            'warp_table',
            'The table it carries them onto, by id or name; empty for the one they are on.',
            (trigger) => trigger.warpTable,
            (trigger, value) => {
              const wanted = value.trim();
              trigger.warpTable = wanted.length < 1 ? '' : tableNamed(wanted).identifier;
            }
          ),
          refuse: (_trigger, value) => {
            const wanted = String(value).trim();
            return wanted.length < 1 ? null : lookupRefusal(() => tableNamed(wanted));
          },
        },
        this.kept(
          flagField<TableTrigger>(
            'found',
            'Whether going off has shown it to the room.',
            null,
            (trigger) => trigger.found
          )
        ),
        this.kept(
          flagField<TableTrigger>(
            'armed',
            'Whether it still has anything left in it.',
            null,
            (trigger) => trigger.isArmed
          )
        ),
        this.kept({
          name: 'spent_by',
          description: 'The pieces it has had already, where it goes off once for each piece.',
          schema: { type: 'array', items: { type: 'string' } },
          access: null,
          read: (trigger) => readSpentBy(trigger.spentBy),
        }),
        this.kept(
          numberField<TableTrigger>(
            'spent_round',
            'The round it last went off in, where it goes off once a round; -1 for none.',
            null,
            {},
            (trigger) => trigger.spentRound
          )
        ),
        this.kept(
          textField<TableTrigger>(
            'switch',
            'The id of the board-switch that says what pressing it does, where it is pressed.',
            null,
            (trigger) => trigger.pressSwitch?.identifier ?? ''
          )
        ),
      ],
      create: {
        access: 'gm',
        description:
          'Lays new ground on the table in view, as the map editor lays it: drawn for the game master only and going off as a walk ends on it, until its fields say otherwise.',
        input: objectInput({ area: { ...AREA, description: 'The cells it covers.' } }, ['area']),
        make: (args) => {
          const table = this.viewTable();
          const trigger = new TableTrigger();
          placeArea(trigger, args['area'] as AgentArea);
          trigger.initialize();
          table.appendChild(trigger);
          return trigger;
        },
      },
      remove: { access: 'gm', take: (trigger) => trigger.destroy() },
    };
  }

  private moveCost(): AgentKind<TableMoveCost> {
    const nameOf = (area: TableMoveCost) => {
      const rect = area.rect;
      return `${area.halves ? 'road' : `+${area.charge}`} at ${rect.col + 1},${rect.row + 1}`;
    };
    return {
      kind: TableMoveCost.aliasName,
      description:
        'Ground on the table in view that costs more to cross than plain footing, or a road that costs half. Everyone is shown it, as a reach gives it away; a seat that is not the master does not list ground wholly under fog it has not explored. Laid by the game master.',
      list: () => {
        const table = TableSelecter.instance.viewTable;
        if (!table) return [];
        return moveCostsOn(table).filter((area) => this.seesBlock(table, area.rect));
      },
      idOf: (area) => area.identifier,
      nameOf,
      fields: [
        {
          name: 'area',
          description: 'The cells it covers.',
          schema: AREA,
          access: 'gm',
          read: (area) => areaOf(area),
          put: (area, value) => placeArea(area, value as AgentArea),
        },
        numberField<TableMoveCost>(
          'extra_cost',
          'What entering one of its cells costs on top of the one step, in steps.',
          'gm',
          { minimum: 1, maximum: MOST_MOVE_COST_EXTRA, integer: true },
          (area) => area.charge,
          (area, value) => {
            area.extraCost = value;
          }
        ),
        flagField<TableMoveCost>(
          'road',
          'Whether it is a road, crossed in half a step whatever else lies under it, in place of its extra cost.',
          'gm',
          (area) => area.halves,
          (area, value) => {
            area.halves = value;
          }
        ),
        colourField<TableMoveCost>(
          'colour',
          'The colour it is drawn in.',
          'gm',
          (area) => area.color,
          (area, colour) => {
            area.color = colour;
          }
        ),
      ],
      create: {
        access: 'gm',
        description: 'Lays new dear ground on the table in view, as the map editor lays it: one extra step a cell.',
        input: objectInput({ area: { ...AREA, description: 'The cells it covers.' } }, ['area']),
        make: (args) => {
          const table = this.viewTable();
          const area = new TableMoveCost();
          placeArea(area, args['area'] as AgentArea);
          area.initialize();
          table.appendChild(area);
          return area;
        },
      },
      remove: { access: 'gm', take: (area) => area.destroy() },
    };
  }

  /** What a switch hangs under, or null where it hangs under nothing a switch belongs to. */
  private hostOf(target: BoardSwitch): Terrain | TableTrigger | null {
    const host = target.parent;
    return host instanceof Terrain || host instanceof TableTrigger ? host : null;
  }

  /** A field of what a switch is and does, written through the master's own hand onto what it says now. */
  private definitionField<C>(
    field: Omit<AgentKindField<BoardSwitch>, 'read' | 'put' | 'access'>,
    read: (definition: SwitchDefinition) => unknown,
    change: (value: C) => Partial<SwitchDefinition>
  ): AgentKindField<BoardSwitch> {
    return {
      ...field,
      access: 'gm',
      read: (target) => read(target.def),
      put: (target, value) => this.switches.write(target, { ...target.def, ...change(value as C) }),
    };
  }

  private boardSwitch(): AgentKind<BoardSwitch> {
    return {
      kind: BoardSwitch.aliasName,
      description:
        'What happens when somebody presses a terrain block or a stretch of pressed ground on the table in view: lines said, sounds and effects played, things shown or hidden, tables shown, pieces carried. The game master writes and reads it; no other seat lists it.',
      list: () => {
        const table = TableSelecter.instance.viewTable;
        if (!table || !this.permission.isGameMaster()) return [];
        const hosts = [...table.terrains, ...triggersOn(table).filter((trigger) => trigger.pressSwitch !== null)];
        return hosts.map((host) => switchOf(host)).filter((target): target is BoardSwitch => target !== null);
      },
      idOf: (target) => target.identifier,
      nameOf: (target) => target.def.label.trim() || this.hostOf(target)?.name.trim() || '',
      fields: [
        {
          name: 'on',
          description: 'What it hangs under: its id, its kind (terrain or table-trigger) and its name.',
          schema: { type: 'object', properties: {}, additionalProperties: true },
          access: null,
          read: (target) => {
            const host = this.hostOf(target);
            return host ? { id: host.identifier, kind: host.aliasName, name: host.name } : null;
          },
        },
        this.definitionField<string>(
          {
            name: 'label',
            description: 'What is written beside it for whoever looks at the table.',
            schema: { type: 'string', maxLength: 200 },
          },
          (definition) => definition.label,
          (label) => ({ label })
        ),
        this.definitionField<(typeof SWITCH_SPEAKERS)[number]>(
          {
            name: 'speaker',
            description:
              'Who its lines are said as: whoever pressed it (presser), the thing it hangs under (host), or the room itself (system).',
            schema: { type: 'string', enum: SWITCH_SPEAKERS },
          },
          (definition) => definition.speaker,
          (speaker) => ({ speaker })
        ),
        this.definitionField<string>(
          {
            name: 'tab',
            description: 'The id of the chat tab it speaks into; empty for the tab the presser has open.',
            schema: { type: 'string', maxLength: 200 },
          },
          (definition) => definition.tab,
          (tab) => ({ tab })
        ),
        this.definitionField<string>(
          {
            name: 'game_type',
            description: "The dice system its lines are rolled under; empty for the speaker's or the room's.",
            schema: { type: 'string', maxLength: 100 },
          },
          (definition) => definition.gameType,
          (gameType) => ({ gameType })
        ),
        this.definitionField<boolean>(
          {
            name: 'guests',
            description: 'Whether somebody watching may press it, where the tab lets watchers speak.',
            schema: { type: 'boolean' },
          },
          (definition) => definition.guests,
          (guests) => ({ guests })
        ),
        this.definitionField<number>(
          {
            name: 'range',
            description: "How near the presser's piece has to stand, in cells; 0 lets it be pressed from anywhere.",
            schema: { type: 'integer', minimum: 0, maximum: MAX_SWITCH_RANGE },
          },
          (definition) => definition.range,
          (range) => ({ range })
        ),
        this.definitionField<boolean>(
          {
            name: 'needs_sight',
            description: 'Whether only somebody who can see it may press it.',
            schema: { type: 'boolean' },
          },
          (definition) => definition.needsSight,
          (needsSight) => ({ needsSight })
        ),
        this.definitionField<(typeof TRIGGER_REPEATS)[number]>(
          {
            name: 'repeat',
            description: 'How often it may be pressed: always, once, once for each piece, or once a round.',
            schema: { type: 'string', enum: TRIGGER_REPEATS },
          },
          (definition) => definition.repeat,
          (repeat) => ({ repeat })
        ),
        this.definitionField<unknown[]>(
          {
            name: 'actions',
            description:
              'What pressing it does, in order, each waiting delayMs (up to 10000) after the one before. Each is an object with a kind and its parts: say {text}; secret {text, to: presser|master}; sound, effect or cutIn {name}; reveal or conceal {target}; spawn {target, count 1-10, place: host|presser}; removeSelf; battle; showTable {table}; scene {scene, keepBgm}; carry {col, row counted from 0, table}; tableSetting {darkness and fog: keep|on|off, image, bgm, bgmStop}. A target, table, scene, image or bgm is {identifier, name}.',
            schema: {
              type: 'array',
              maxItems: MAX_SWITCH_ACTIONS,
              items: {
                type: 'object',
                properties: { kind: { type: 'string', enum: SWITCH_ACTION_KINDS } },
                required: ['kind'],
                additionalProperties: true,
              },
            },
          },
          (definition) => (JSON.parse(encodeSwitchDefinition(definition)) as { actions: unknown[] }).actions,
          (actions) => ({ actions: parseSwitchDefinition(JSON.stringify({ actions })).actions })
        ),
        flagField<BoardSwitch>('spent', 'Whether it has been used up, where it may be pressed once.', null, (target) =>
          Boolean(target.spent)
        ),
        {
          name: 'pressed_by',
          description: 'The pieces that have pressed it already, where each may press it once.',
          schema: { type: 'array', items: { type: 'string' } },
          access: null,
          read: (target) => readSpentBy(target.spentBy),
        },
        numberField<BoardSwitch>(
          'last_round',
          'The round it was last pressed in, where it may be pressed once a round; -1 for none.',
          null,
          {},
          (target) => target.lastRound
        ),
        flagField<BoardSwitch>(
          'retired',
          "Whether a press has put the ground it hangs under away, out of the room's sight.",
          null,
          (target) => Boolean(target.retired)
        ),
      ],
      create: {
        access: 'gm',
        description:
          'Makes a terrain block on the table in view into a switch that does nothing yet, as its menu does. Ground that is pressed gets its switch when its moment is set to press.',
        input: namedInput('on', 'The id or name of the terrain block on the table in view.'),
        make: (args) => {
          const terrain = findOne(
            this.viewTable().terrains,
            String(args['on']),
            (each) => each.identifier,
            (each) => each.name,
            'terrain'
          );
          if (switchOf(terrain)) throw new AgentToolError('not_allowed', `${terrain.name} is a switch already.`);
          const made = this.switches.ensure(terrain);
          if (!made) throw new AgentToolError('not_allowed', 'Only the game master makes a switch.');
          return made;
        },
      },
      remove: {
        access: 'gm',
        take: (target) => {
          const host = this.hostOf(target);
          if (host instanceof TableTrigger) {
            throw new AgentToolError(
              'not_allowed',
              'Ground that is pressed needs its switch; change the moment of the table-trigger, or take it away.'
            );
          }
          if (host) this.switches.remove(host);
        },
      },
      actions: [
        {
          name: 'reset',
          description:
            'Forgets that it was ever pressed, so it can be pressed again; ground a press put away or gave away is set back as it was laid.',
          access: 'gm',
          input: objectInput(),
          run: (target) => {
            const host = this.hostOf(target);
            if (host) this.switches.reset(host);
            return { reset: target.identifier };
          },
        },
      ],
    };
  }

  private boardStash(): AgentKind<typeof STASH> {
    const listed = (object: { identifier: string; aliasName: string; name: string }) => ({
      id: object.identifier,
      kind: object.aliasName,
      name: object.name,
    });
    return {
      kind: BoardStash.aliasName,
      description:
        'What the game master has put out of sight on the tables: terrain blocks and masks, and pieces, notes, dice, coins and decks, each kept where it stood until it is brought back. One thing of its kind, which only the game master comes across.',
      list: () => (this.permission.isGameMaster() ? [STASH] : []),
      idOf: (stash) => stash.identifier,
      nameOf: () => 'out of sight',
      fields: [
        {
          name: 'things',
          description: 'Everything put out of sight, on every table: id, kind and name.',
          schema: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } },
          access: null,
          read: () => this.concealment.concealed().map(listed),
        },
      ],
      actions: [
        {
          name: 'conceal',
          description:
            'Puts a terrain block or mask of the table in view, or a piece, note, die, coin or deck lying on the table, out of sight where it stands.',
          access: 'gm',
          input: namedInput('id', 'The id or name of the thing to put out of sight.'),
          run: (_stash, args) => {
            const thing = findOne(
              this.concealment.concealable(),
              String(args['id']),
              (each) => each.identifier,
              (each) => each.name,
              'thing on the table'
            );
            if (!this.concealment.conceal(thing))
              throw new AgentToolError('failed', `${thing.name} could not be put out of sight.`);
            return { concealed: listed(thing) };
          },
        },
        {
          name: 'reveal',
          description: 'Brings something put out of sight back to exactly where it was.',
          access: 'gm',
          input: namedInput('id', 'The id or name of the thing to bring back, among things.'),
          run: (_stash, args) => {
            const thing = findOne(
              this.concealment.concealed(),
              String(args['id']),
              (each) => each.identifier,
              (each) => each.name,
              'thing out of sight'
            );
            if (!this.concealment.reveal(thing))
              throw new AgentToolError('failed', `${thing.name} could not be brought back.`);
            return { revealed: listed(thing) };
          },
        },
      ],
    };
  }

  private fogMemory(): AgentKind<FogMemory> {
    const tableOf = (memory: FogMemory) => (memory.parent instanceof GameTable ? memory.parent : null);
    return {
      kind: FogMemory.aliasName,
      description:
        'What the fog of war of the table in view remembers as explored by the party. There is none until the party has explored something.',
      list: () => {
        const table = TableSelecter.instance.viewTable;
        const memory = table ? fogMemoryOn(table) : null;
        return memory ? [memory] : [];
      },
      idOf: (memory) => memory.identifier,
      nameOf: (memory) => `fog of ${tableOf(memory)?.name ?? ''}`,
      fields: [
        textField<FogMemory>(
          'table',
          'The id of the table it belongs to.',
          null,
          (memory) => tableOf(memory)?.identifier ?? ''
        ),
        numberField<FogMemory>('explored_cells', 'How many cells have been explored.', null, {}, (memory) => {
          const explored = memory.read(memory.grid);
          let count = 0;
          for (let index = 0; index < explored.count; index++) if (explored.get(index)) count++;
          return count;
        }),
      ],
      actions: [
        {
          name: 'reset',
          description:
            'Forgets every explored cell and found piece, so the fog covers the whole table again, as the table settings panel does.',
          access: 'write',
          input: objectInput(),
          destructive: true,
          run: (memory) => {
            const table = tableOf(memory);
            if (!table) throw new AgentToolError('failed', 'The fog belongs to no table.');
            ensureFogMemoryOn(table).reset();
            return { reset: table.name };
          },
        },
      ],
    };
  }

  /** Whether this seat sees a piece on the table, by id. */
  private seesPiece(identifier: string): boolean {
    const piece = this.objectStore.get<GameCharacter>(identifier);
    return piece instanceof GameCharacter && this.vision.isTokenVisible(piece);
  }

  private engagementZone(): AgentKind<EngagementZone> {
    const viewOf = (zone: EngagementZone) =>
      this.zones.stateNow().zones.find((view) => view.id === zone.identifier) ?? null;
    const centreOf = (zone: EngagementZone) => {
      const centre = zone.centre;
      return centre ? this.views.squareAt(centre.x, centre.y) : null;
    };
    return {
      kind: EngagementZone.aliasName,
      description:
        'A fight declared on the table in view, drawn as a circle or a square about the square it stands on, holding the pieces in it. It is made by the pieces declaring a fight and ends by itself when it no longer holds two sides. None is listed where the room does not play engagement zones; a seat that is not the master lists only zones holding a piece it sees, and is not shown how many each holds.',
      list: () => {
        const master = this.permission.isGameMaster();
        return this.zones
          .stateNow()
          .zones.filter((view) => master || view.members.some((id) => this.seesPiece(id)))
          .map((view) => this.objectStore.get<EngagementZone>(view.id))
          .filter((zone): zone is EngagementZone => zone instanceof EngagementZone);
      },
      idOf: (zone) => zone.identifier,
      nameOf: (zone) => {
        const square = centreOf(zone);
        return square ? `zone at ${square.col},${square.row}` : 'zone';
      },
      fields: [
        {
          name: 'centre',
          description: 'The square it stands on.',
          schema: SQUARE_SCHEMA,
          access: null,
          read: (zone) => centreOf(zone),
        },
        choiceField<EngagementZone, 'circle' | 'square'>(
          'shape',
          'Whether it is drawn as a circle or a square.',
          'gm',
          ['circle', 'square'],
          (zone) => (zone.isSquare ? 'square' : 'circle'),
          (zone, value) => this.zones.setSquare(zone.identifier, value === 'square')
        ),
        this.kept({
          ...numberField<EngagementZone>(
            'limit',
            `The most it may hold, from ${FEWEST_ZONE_LIMIT} to ${MOST_ZONE_LIMIT}; 0 for as many as the size table allows.`,
            'gm',
            { minimum: 0, maximum: MOST_ZONE_LIMIT, integer: true },
            (zone) => zone.limit ?? 0,
            (zone, value) => this.zones.setLimit(zone.identifier, value === 0 ? null : value)
          ),
          refuse: (_zone, value) =>
            value === 0 || Number(value) >= FEWEST_ZONE_LIMIT
              ? null
              : `A zone holds from ${FEWEST_ZONE_LIMIT} to ${MOST_ZONE_LIMIT}, or 0 for as many as the size table allows.`,
        }),
        this.kept({
          name: 'holding',
          description: 'How many bodies stand in it against the most it holds now, and whether it holds more.',
          schema: { type: 'object', properties: {}, additionalProperties: true },
          access: null,
          read: (zone) => {
            const view = viewOf(zone);
            return view ? { occupants: view.occupants, most: view.limit, overflowing: view.overflowing } : null;
          },
        }),
        flagField<EngagementZone>(
          'forming',
          'Whether it is declared but not yet in force, until the turn it was declared in ends.',
          null,
          (zone) => zone.isForming
        ),
        {
          name: 'members',
          description: 'The ids of the pieces in it that this seat sees.',
          schema: { type: 'array', items: { type: 'string' } },
          access: null,
          read: (zone) => {
            const master = this.permission.isGameMaster();
            return (viewOf(zone)?.members ?? []).filter((id) => master || this.seesPiece(id));
          },
        },
      ],
      remove: { access: 'gm', take: (zone) => this.zones.remove(zone.identifier) },
    };
  }

  private moveBlockMap(): AgentKind<MoveBlockMap> {
    const tableOf = (map: MoveBlockMap) => (map.parent instanceof GameTable ? map.parent : null);
    return {
      kind: MoveBlockMap.aliasName,
      description:
        'The cells of the table in view that pieces may not move into. Read only: the map editor paints them. A seat that is not the master is not told of cells under fog it has not explored.',
      list: () => {
        const table = TableSelecter.instance.viewTable;
        const map = table ? moveBlockMapOn(table) : null;
        return map ? [map] : [];
      },
      idOf: (map) => map.identifier,
      nameOf: (map) => `cells closed on ${tableOf(map)?.name ?? ''}`,
      fields: [
        {
          name: 'closed',
          description:
            'The closed cells, a row to an entry: its row counted from 1, and its columns as runs such as "3-5, 9".',
          schema: { type: 'array', items: { type: 'object', properties: {}, additionalProperties: true } },
          access: null,
          read: (map) => {
            const table = tableOf(map);
            if (!table) return [];
            const grid = boardGridOf(table);
            const closed = map.read(grid);
            const rows: { row: number; cols: string }[] = [];
            for (let row = 0; row < grid.rows; row++) {
              const cols: number[] = [];
              for (let col = 0; col < grid.cols; col++) {
                if (closed.get(cellIndexOf(grid, col, row)) && this.seesCell(grid, col, row)) cols.push(col + 1);
              }
              if (cols.length > 0) rows.push({ row: row + 1, cols: runsOf(cols) });
            }
            return rows;
          },
        },
      ],
    };
  }

  private groundChunk(): AgentKind<GroundChunk> {
    const firstCellOf = (chunk: GroundChunk) => {
      const data = chunk.read();
      return data ? { col: data.cx * GROUND_CHUNK_CELLS + 1, row: data.cy * GROUND_CHUNK_CELLS + 1 } : null;
    };
    return {
      kind: GroundChunk.aliasName,
      description: `A block of ${GROUND_CHUNK_CELLS} by ${GROUND_CHUNK_CELLS} cells of the raised and sunk ground of the table in view, as the ground brush shapes it. Read only. A seat that is not the master is not told the height of cells under fog it has not explored.`,
      list: () => {
        const table = TableSelecter.instance.viewTable;
        const field = table ? groundFieldOn(table) : null;
        return field
          ? field.children.filter(
              (child): child is GroundChunk => child instanceof GroundChunk && child.read() !== null
            )
          : [];
      },
      idOf: (chunk) => chunk.identifier,
      nameOf: (chunk) => {
        const first = firstCellOf(chunk);
        return first
          ? `cols ${first.col}-${first.col + GROUND_CHUNK_CELLS - 1}, rows ${first.row}-${first.row + GROUND_CHUNK_CELLS - 1}`
          : '';
      },
      fields: [
        {
          name: 'first_cell',
          description: 'Its north-west cell.',
          schema: SQUARE_SCHEMA,
          access: null,
          read: (chunk) => firstCellOf(chunk),
        },
        {
          name: 'heights',
          description:
            'The height of the ground at the middle of each of its cells, in cells above the board (below it where less than 0): a list of rows, north first, each a list of cells, west first. Null for a cell off the board or kept from this seat.',
          schema: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          access: null,
          read: (chunk) => {
            const data = chunk.read();
            const table = chunk.parent?.parent;
            if (!data || !(table instanceof GameTable)) return null;
            const half = GROUND_SAMPLES_PER_CELL / 2;
            const rows: (number | null)[][] = [];
            for (let row = 0; row < GROUND_CHUNK_CELLS; row++) {
              const cells: (number | null)[] = [];
              for (let col = 0; col < GROUND_CHUNK_CELLS; col++) {
                const boardCol = data.cx * GROUND_CHUNK_CELLS + col;
                const boardRow = data.cy * GROUND_CHUNK_CELLS + row;
                const onBoard = boardCol < table.width && boardRow < table.height;
                const shown =
                  onBoard &&
                  !this.vision.isHiddenByFog((boardCol + 0.5) * table.gridSize, (boardRow + 0.5) * table.gridSize);
                const sample =
                  (row * GROUND_SAMPLES_PER_CELL + half) * GROUND_CHUNK_SAMPLES + col * GROUND_SAMPLES_PER_CELL + half;
                cells.push(shown ? Math.round(data.heights[sample] * GROUND_HEIGHT_STEP * 1000) / 1000 : null);
              }
              rows.push(cells);
            }
            return rows;
          },
        },
      ],
    };
  }
}
