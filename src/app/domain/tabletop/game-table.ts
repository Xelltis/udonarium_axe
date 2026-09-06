import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { DEFAULT_AMBIENCE_DENSITY } from '@axe/domain/effect/ambience/ambience-kind';
import { DEFAULT_FOG_COLOR, DEFAULT_FOG_MODE, FogMode } from '@axe/domain/tabletop/fog/fog-mode';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import {
  DEFAULT_CELL_DISTANCE,
  DEFAULT_CELL_DISTANCE_UNIT,
  DEFAULT_MOVE_RANGE_ELEMENT_NAMES,
} from '@axe/domain/tabletop/move/move-cells';
import { DEFAULT_ZOC_EXTRA_COST, DEFAULT_ZOC_MODE, DEFAULT_ZOC_RANGE } from '@axe/domain/tabletop/move/zone-of-control';
import { DEFAULT_CELL_MM } from '@axe/domain/tabletop/physical-scale';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { DEFAULT_TABLE_FACING_MARK, TableFacingMark } from '@axe/domain/tabletop/table-facing-mark';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { DEFAULT_AMBIENT_COLOR } from '@axe/domain/tabletop/vision-types';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';

export enum GridType {
  NONE = -1,
  SQUARE = 0,
  HEX_VERTICAL = 1,
  HEX_HORIZONTAL = 2,
}

export enum GridSnapStyle {
  CENTER = 0,
  VERTEX = 1,
  BOTH = 2,
  ALL = 3,
}

export enum FilterType {
  NONE = '',
  WHITE = 'white',
  BLACK = 'black',
}

@SyncObject('game-table')
export class GameTable extends ObjectNode {
  @SyncVar() name: string = 'テーブル';
  @SyncVar() width: number = 20;
  @SyncVar() height: number = 20;
  @SyncVar() gridSize: number = 50;
  @SyncVar() imageIdentifier: string = 'imageIdentifier';
  @SyncVar() backgroundImageIdentifier: string = 'imageIdentifier';
  @SyncVar() backgroundFilterType: FilterType = FilterType.NONE;
  @SyncVar() selected: boolean = false;
  @SyncVar() gridType: GridType = GridType.SQUARE;
  @SyncVar() lightSnapToGrid: boolean = false;
  @SyncVar() gridColor: string = '#000000e6';
  @SyncVar() gridFontColor: string = '#000000e6';
  @SyncVar() gridShow: boolean = false;
  @SyncVar() gridSnap: boolean = true;
  @SyncVar() gridSnapStyle: GridSnapStyle = GridSnapStyle.CENTER;
  @SyncVar() imageBillboard: boolean = false;
  @SyncVar() mode2d: boolean = false;
  @SyncVar() terrainRotationIn2dEnabled: boolean = false;
  /** How a piece shows which way it faces; see {@link TableFacingMark}. */
  @SyncVar() facingMark: TableFacingMark = DEFAULT_TABLE_FACING_MARK;
  /** How wide one square is meant to measure on the glass, for a screen laid flat under miniatures. */
  @SyncVar() cellMm: number = DEFAULT_CELL_MM;
  @SyncVar() wallHeight: number = 10;
  @SyncVar() northWallImageIdentifier: string = 'imageIdentifier';
  @SyncVar() eastWallImageIdentifier: string = 'imageIdentifier';
  @SyncVar() southWallImageIdentifier: string = 'imageIdentifier';
  @SyncVar() westWallImageIdentifier: string = 'imageIdentifier';
  @SyncVar() showNorthWall: boolean = false;
  @SyncVar() showEastWall: boolean = false;
  @SyncVar() showSouthWall: boolean = false;
  @SyncVar() showWestWall: boolean = false;

  @SyncVar() darknessEnabled: boolean = false;
  @SyncVar() darknessLevel: number = 0.92;
  @SyncVar() ambientColor: string = DEFAULT_AMBIENT_COLOR;
  @SyncVar() globalIllumination: number = 0;

  @SyncVar() fogEnabled: boolean = false;
  @SyncVar() fogMode: FogMode = DEFAULT_FOG_MODE;
  @SyncVar() fogColor: string = DEFAULT_FOG_COLOR;

  @SyncVar() moveRangeEnabled: boolean = true;
  @SyncVar() moveRangeElementNames: string = DEFAULT_MOVE_RANGE_ELEMENT_NAMES;
  /** Whether a piece on squares may step across a corner. A hex board has none to cut. */
  @SyncVar() moveDiagonally: boolean = true;
  /** Whether two pieces may stand on one cell. Left off, a piece walks past rather than onto. */
  @SyncVar() piecesShareCells: boolean = true;
  /** Whether the piece a reader has picked keeps showing its reach, not only while carried. */
  @SyncVar() moveRangeAlways: boolean = false;
  /** Whether the ground held against the piece a reader has picked keeps showing. */
  @SyncVar() zocAlways: boolean = false;
  @SyncVar() cellDistance: number = DEFAULT_CELL_DISTANCE;
  @SyncVar() cellDistanceUnit: string = DEFAULT_CELL_DISTANCE_UNIT;

  /** What the ground around an enemy does to a piece walking into it. One of ZOC_MODES. */
  @SyncVar() zocMode: string = DEFAULT_ZOC_MODE;
  /** How many cells out from an enemy that ground reaches. */
  @SyncVar() zocRange: number = DEFAULT_ZOC_RANGE;
  /** What entering it costs on top of the one step, where the table charges for it. */
  @SyncVar() zocExtraCost: number = DEFAULT_ZOC_EXTRA_COST;

  /** The weather over the whole map. Empty for none. */
  @SyncVar() weatherKind: string = '';
  @SyncVar() weatherColor: string = '';
  @SyncVar() weatherDensity: number = DEFAULT_AMBIENCE_DENSITY;

  /** Cut-ins to play when this table is chosen. Several are separated by commas, and one is drawn. */
  @SyncVar() cutInIdentifiers: string = '';

  gridClipRect: { top: number; right: number; bottom: number; left: number } | null = null;
  get terrains(): Terrain[] {
    return this.children.filter((o): o is Terrain => o instanceof Terrain);
  }

  get lightSources(): LightSource[] {
    return this.children.filter((o): o is LightSource => o instanceof LightSource);
  }

  get whiteBoards(): WhiteBoard[] {
    return this.children.filter((o): o is WhiteBoard => o instanceof WhiteBoard);
  }

  get ambiences(): TableAmbience[] {
    return this.children.filter((o): o is TableAmbience => o instanceof TableAmbience);
  }

  get masks(): GameTableMask[] {
    return this.children.filter((o): o is GameTableMask => o instanceof GameTableMask);
  }

  get scratchMasks(): GameTableScratchMask[] {
    return this.children.filter((o): o is GameTableScratchMask => o instanceof GameTableScratchMask);
  }

  // GameObject Lifecycle
  override onStoreAdded() {
    super.onStoreAdded();
    if (this.selected) emitSelectGameTable({ identifier: this.identifier });
  }
}
