import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { assembleScene, collectLights, collectSegments } from '@axe/application/tabletop/vision-scene-assembly';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_VISION_MEMO_MISS, PERF_VISION_SCENE, perfCounters, perfTimed } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { partyIdsOwnedBy } from '@axe/domain/party/party-membership';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import {
  cellCenterOf,
  cellCount,
  CellGrid,
  cellGridOf,
  cellIndexAt,
  forEachCellInBox,
  forEachNeighbourCell,
} from '@axe/domain/tabletop/fog/cell-grid';
import { fogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import {
  DEFAULT_FOG_COLOR,
  FOG_EDGE_BLUR_RATIO,
  FOG_GM_ALPHA_FACTOR,
  FOG_UNEXPLORED_ALPHA,
  FOG_VEIL_ALPHA,
  FOG_VEIL_COLOR,
  fogRules,
} from '@axe/domain/tabletop/fog/fog-mode';
import { computeVisibleCellsFor, VisibleCellsOptions } from '@axe/domain/tabletop/fog/visible-cells';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { SegmentIndexes } from '@axe/domain/tabletop/los/segment-index';
import { rectangleSegments } from '@axe/domain/tabletop/los/segments';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import {
  computeLightBeam,
  computeLightGlow,
  computeWallLights,
  computeWallSilhouettes,
  darknessAlphaFor,
  eyeHeightPx,
  isPointVisible,
  type LightBeam,
  type LightGlow,
  objectBrightnessFor,
  type OverlayVision,
  type SceneLight,
  type SceneViewer,
  type SceneVisionSource,
  viewerShares,
  type VisionScene,
  type WallFace,
  type WallLight,
  type WallSilhouette,
} from '@axe/domain/tabletop/vision-scene';
import { VisionType } from '@axe/domain/tabletop/vision-types';

const GEOMETRY_THROTTLE_MS = 40;
const RELEVANT_ALIASES = new Set(['character', 'light-source', 'terrain', 'game-table']);
/** How many table cells one bucket of the sight index spans. */
const SIGHT_INDEX_BUCKET_CELLS = 2;
/** What the walls of a place are cut from. A piece walking past moves none of it. */
const STANDING_ALIASES = new Set(['terrain', 'game-table']);
/** How many answers to keep, set well above what a single repaint asks for. */
const MEMO_LIMIT = 8192;
const EMPTY_SILHOUETTES: WallSilhouette[] = [];
const EMPTY_WALL_LIGHTS: WallLight[] = [];
const EMPTY_FOUND: ReadonlySet<string> = new Set();
/** How far towards an open neighbour a wall's face is read, as a share of the way to it. */
const FACE_READ_STEP = 0.6;

/** The cells a terrain covers, told apart into the ones the party has walked to and the rest. */
export interface TerrainFogCover {
  cols: number;
  rows: number;
  cleared: boolean[];
  /** How brightly each cell is lit, read at its open sides. */
  brightness: number[];
}

function faceKey(face: WallFace): string {
  return `${face.ax}:${face.ay}:${face.bx}:${face.by}:${face.nx}:${face.ny}:${face.heightPx}`;
}

function sameIds(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

/** Who is looking, by what they are rather than by the object that says so. */
function sameViewer(a: SceneViewer, b: SceneViewer): boolean {
  return (
    a.userId === b.userId &&
    a.isGameMaster === b.isGameMaster &&
    sameIds(a.visionOwnerIds, b.visionOwnerIds) &&
    sameIds(a.partyIds, b.partyIds)
  );
}

@Injectable({ providedIn: 'root' })
export class VisionService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly destroyRef = inject(DestroyRef);

  readonly previewAsUserId = signal<string | null>(null);
  private readonly geometryEpoch = signal(0);
  private readonly standingEpoch = signal(0);

  /**
   * Remembers the answers for as long as the scene and the viewer hold still.
   *
   * Wall faces and brightness are asked for on every repaint: eight times per terrain and once
   * per piece, each walking every light and every caster. When the answer is the same, so is
   * the array: a new one would send the view off to rebuild its list for nothing.
   */
  private memoScene: VisionScene | null = null;
  private memoViewer: SceneViewer | null = null;
  private readonly memo = new Map<string, unknown>();

  private recall<T>(key: string, compute: () => T): T {
    const scene = this.scene();
    const viewer = this.viewer();
    if (scene !== this.memoScene || viewer !== this.memoViewer) {
      this.memoScene = scene;
      this.memoViewer = viewer;
      this.memo.clear();
    }
    const cached = this.memo.get(key);
    if (cached !== undefined) return cached as T;
    perfCounters.bump(PERF_VISION_MEMO_MISS);
    const value = perfTimed(key.slice(0, key.indexOf(':')), compute);
    // It grows with the number of places asked about, so it is capped rather than left to swell.
    if (this.memo.size >= MEMO_LIMIT) this.memo.clear();
    this.memo.set(key, value);
    return value;
  }

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let standingTimer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        this.geometryEpoch.update((v) => v + 1);
      }, GEOMETRY_THROTTLE_MS);
    };
    const bumpStanding = () => {
      if (standingTimer !== null) return;
      standingTimer = setTimeout(() => {
        standingTimer = null;
        this.standingEpoch.update((v) => v + 1);
      }, GEOMETRY_THROTTLE_MS);
    };
    const changed = (aliasName: string) => {
      if (!RELEVANT_ALIASES.has(aliasName)) return;
      perfCounters.bump(`dirty:${aliasName}`);
      bump();
      if (STANDING_ALIASES.has(aliasName)) bumpStanding();
    };
    this.objectChange.onObjectChangedForAlias(
      [...RELEVANT_ALIASES],
      (event) => changed(event.aliasName),
      this.destroyRef
    );
    this.objectChange.objectAdded$.subscribe((event) => changed(event.aliasName), this.destroyRef);
    this.objectChange.objectRemoved$.subscribe((event) => changed(event.aliasName), this.destroyRef);
    this.destroyRef.onDestroy(() => {
      if (timer !== null) clearTimeout(timer);
      if (standingTimer !== null) clearTimeout(standingTimer);
    });
  }

  /**
   * The walls in the way of sight and of light, which only what stands on the table can move.
   *
   * Kept apart from the scene so that a piece crossing the floor hands the same lists back
   * rather than cutting seven hundred terrains into segments again, and so that what has been
   * worked out about those lists survives the walk.
   */
  private readonly standingSegments = computed(() => {
    this.standingEpoch();
    const table = this.currentTable();
    if (!table) return null;
    const gridSize = table.gridSize;
    return collectSegments(table, gridSize, table.width * gridSize, table.height * gridSize);
  });

  readonly viewer = computed<SceneViewer>(
    () => {
      this.objectChange.versionOf(PeerCursor.myCursor?.identifier ?? '')();
      this.objectChange.collectionOf('PeerCursor')();
      this.geometryEpoch();
      const preview = this.previewAsUserId();
      if (preview) {
        const cursor = PeerCursor.findByUserId(preview);
        return cursor?.isGuest
          ? { userId: preview, isGameMaster: false, visionOwnerIds: this.playerVisionOwnerIds() }
          : { userId: preview, isGameMaster: false, partyIds: this.partyIdsOf(preview) };
      }
      const my = PeerCursor.myCursor;
      if (my?.isGuest) {
        return { userId: my.userId, isGameMaster: false, visionOwnerIds: this.playerVisionOwnerIds() };
      }
      const userId = my?.userId ?? '';
      return { userId, isGameMaster: my?.isGameMaster ?? false, partyIds: this.partyIdsOf(userId) };
    },
    { equal: sameViewer }
  );

  /**
   * Whose eyes make up the party's map.
   *
   * The players at the table, so that what the game master keeps aside stays theirs to know.
   * With no player at the table at all every piece counts instead, which is a room being set
   * up or run by one person: there is nobody for the master to be keeping anything from.
   */
  private partyOwnerIds(sources: readonly SceneVisionSource[]): Set<string> {
    const players = this.playerVisionOwnerIds();
    if (players.length > 0) return new Set(players);
    return new Set(sources.map((source) => source.owner).filter((owner) => owner.length > 0));
  }

  private shownVisionIds(): Set<string> {
    const shown = new Set<string>();
    for (const character of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (character.showVisionRange) shown.add(character.identifier);
    }
    return shown;
  }

  private playerVisionOwnerIds(): string[] {
    return this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => cursor.isPlayer && cursor.userId.length > 0)
      .map((cursor) => cursor.userId);
  }

  private partyIdsOf(userId: string): string[] {
    return partyIdsOwnedBy(this.objectStore.getObjects<GameCharacter>(GameCharacter), userId);
  }

  private currentTable(): GameTable | null {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return table;
  }

  readonly active = computed(() => {
    const table = this.currentTable();
    return (table?.darknessEnabled || table?.fogEnabled) ?? false;
  });

  readonly scene = computed<VisionScene | null>(() => {
    this.geometryEpoch();
    perfCounters.bump(PERF_VISION_SCENE);
    return perfTimed('scene', () => this.buildScene());
  });

  private buildScene(): VisionScene | null {
    const table = this.currentTable();
    if (!table) return null;
    const standing = this.standingSegments();
    if (!standing) return null;
    return assembleScene(table, this.objectStore.getObjects(GameCharacter), standing, (identifier) =>
      this.objectStore.get<GameCharacter>(identifier)
    );
  }

  private readonly cellGrid = computed<CellGrid | null>(() => {
    const table = this.currentTable();
    if (!table) return null;
    return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  });

  /**
   * The cells a sight-stopping wall stands on.
   *
   * Kept with the walls rather than with the scene, so that a piece walking about does not
   * cut every terrain on the table into cells again.
   */
  private readonly blockingCells = computed<CellBits | null>(() => {
    this.standingEpoch();
    const grid = this.cellGrid();
    const table = this.currentTable();
    if (!grid || !table) return null;
    const bits = new CellBits(cellCount(grid));
    for (const terrain of table.terrains) {
      if (!terrain.hasWall || !terrain.blocksSightNow || surfaceOf(terrain) !== 'floor') continue;
      const box = this.terrainBox(terrain, grid.sizePx);
      forEachCellInBox(grid, box.minX, box.minY, box.maxX, box.maxY, (cell) => bits.set(cell));
    }
    return bits;
  });

  private terrainBox(terrain: Terrain, gridSize: number): { minX: number; minY: number; maxX: number; maxY: number } {
    const edges = rectangleSegments(
      terrain.location.x,
      terrain.location.y,
      terrain.width * gridSize,
      terrain.depth * gridSize,
      terrain.rotate
    );
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const edge of edges) {
      minX = Math.min(minX, edge.x1, edge.x2);
      minY = Math.min(minY, edge.y1, edge.y2);
      maxX = Math.max(maxX, edge.x1, edge.x2);
      maxY = Math.max(maxY, edge.y1, edge.y2);
    }
    return { minX, minY, maxX, maxY };
  }

  private readonly sightIndexes = computed<SegmentIndexes | null>(() => {
    const standing = this.standingSegments();
    const table = this.currentTable();
    if (!standing || !table) return null;
    return new SegmentIndexes(standing.sight, table.gridSize * SIGHT_INDEX_BUCKET_CELLS);
  });

  /**
   * Which cells each pair of eyes on the table reaches.
   *
   * Kept per pair rather than as one answer because three questions are asked of it: what the
   * reader sees, what the party between them has been shown, and what one piece alone reaches
   * when its own sight is drawn out.
   */
  private readonly visionCells = computed(() => {
    const scene = this.scene();
    const grid = this.cellGrid();
    const indexes = this.sightIndexes();
    const table = this.currentTable();
    if (!scene || !grid || !indexes || !table || !this.active()) return null;
    return perfTimed('cells', () => {
      const options: VisibleCellsOptions = { scene, grid, indexes, blocking: this.blockingCells() ?? undefined };
      const perSource = new Map<string, CellBits>();
      const shared = new CellBits(cellCount(grid));
      const players = this.partyOwnerIds(scene.visionSources);
      const viewer = this.viewer();
      const shown = this.shownVisionIds();
      // Sight belongs to the piece standing on the table. A piece nobody has claimed is the
      // party's eyes all the same — user ids change between connections, and nothing on the
      // piece says whose it is. A piece marked as the game master's is theirs to keep aside,
      // claimed or not: a monster set out on the board is not one of the party's eyes.
      for (const source of scene.visionSources) {
        const communal = source.owner === '' && !source.isNpc;
        const wanted =
          communal ||
          players.has(source.owner) ||
          shown.has(source.sourceId) ||
          viewerShares(viewer, source.owner, source.partyId);
        if (!wanted) continue;
        const cells = computeVisibleCellsFor(source, options);
        perSource.set(source.sourceId, cells);
        if (communal || players.has(source.owner)) shared.or(cells);
      }
      return { grid, perSource, shared };
    });
  });

  /** Null when the reader has no eyes of their own, which is when nothing is cut back to them. */
  private readonly viewerCells = computed<CellBits | null>(() => {
    const cells = this.visionCells();
    const scene = this.scene();
    if (!cells || !scene) return null;
    const viewer = this.viewer();
    if (viewer.isGameMaster) return null;
    const mine = new CellBits(cellCount(cells.grid));
    let any = false;
    for (const source of scene.visionSources) {
      if (source.type === VisionType.BLIND) continue;
      if (source.owner !== '' && !viewerShares(viewer, source.owner, source.partyId)) continue;
      const own = cells.perSource.get(source.sourceId);
      if (!own) continue;
      mine.or(own);
      any = true;
    }
    return any ? mine : null;
  });

  readonly sharedVisibleCells = computed<{ grid: CellGrid; cells: CellBits } | null>(() => {
    const cells = this.visionCells();
    return cells ? { grid: cells.grid, cells: cells.shared } : null;
  });

  readonly exploredCells = computed<CellBits | null>(() => {
    const cells = this.visionCells();
    const table = this.currentTable();
    if (!cells || !table || !table.fogEnabled) return null;
    const explored = cells.shared.copy();
    if (fogRules(table.fogMode).remembersGround) {
      this.objectChange.collectionOf('fog-memory')();
      const memory = fogMemoryOn(table);
      if (memory) {
        this.objectChange.versionOf(memory.identifier)();
        explored.or(memory.read(cells.grid));
      }
    }
    return explored;
  });

  readonly overlayVision = computed<OverlayVision | undefined>(() => {
    const cells = this.visionCells();
    const table = this.currentTable();
    if (!cells || !table) return undefined;
    const own = this.viewerCells();
    const isGameMaster = this.viewer().isGameMaster;
    const dim = isGameMaster ? FOG_GM_ALPHA_FACTOR : 1;
    const rules = fogRules(table.fogMode);
    const explored = this.exploredCells() ?? cells.shared;
    // Ground the party has taken is held in plain sight: it counts as seen, so no veil falls
    // back over it and the light it was cleared under is not asked about again. Not for the
    // game master, who is shown the board as it stands rather than as the party holds it.
    const held = table.fogEnabled && rules.clearedStaysLit && !isGameMaster;
    return {
      grid: cells.grid,
      visible: held ? explored : (own ?? cells.shared),
      explored,
      clipReveals: held ? true : own !== null,
      fogEnabled: table.fogEnabled,
      fogColor: table.fogColor,
      veilColor: FOG_VEIL_COLOR,
      veilAlpha: held ? 0 : FOG_VEIL_ALPHA * dim,
      unexploredAlpha: FOG_UNEXPLORED_ALPHA * dim,
      blurPx: table.gridSize * FOG_EDGE_BLUR_RATIO,
      rememberSeen: table.fogEnabled && rules.remembersGround,
      clearedStaysLit: held,
    };
  });

  /**
   * The pieces the party can see between them right now, by identifier.
   *
   * Drawn from the cells the party's own eyes reach rather than from whoever is looking, so
   * every client works out the same answer and the record they keep agrees.
   */
  readonly partyVisiblePieces = computed<ReadonlySet<string>>(() => {
    const cells = this.visionCells();
    const scene = this.scene();
    if (!cells || !scene) return EMPTY_FOUND;
    const found = new Set<string>();
    for (const character of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (!character.isVisibleOnTable || surfaceOf(character) !== 'floor') continue;
      this.objectChange.versionOf(character.identifier)();
      const half = (scene.gridSize * (character.size || 1)) / 2;
      const cell = cellIndexAt(cells.grid, character.location.x + half, character.location.y + half);
      if (cell >= 0 && cells.shared.get(cell)) found.add(character.identifier);
    }
    return found;
  });

  /** The pieces the party has met, on a table that follows what it has found. */
  readonly foundPieces = computed<ReadonlySet<string>>(() => {
    const table = this.currentTable();
    if (!table || !table.fogEnabled || !fogRules(table.fogMode).tracksFoundPieces) return EMPTY_FOUND;
    this.objectChange.collectionOf('fog-memory')();
    const memory = fogMemoryOn(table);
    if (!memory) return EMPTY_FOUND;
    this.objectChange.versionOf(memory.identifier)();
    return memory.readFound();
  });

  visibleCellsOf(identifier: string): { grid: CellGrid; cells: CellBits } | null {
    const cells = this.visionCells();
    const own = cells?.perSource.get(identifier);
    return cells && own ? { grid: cells.grid, cells: own } : null;
  }

  /**
   * Whether a thing standing on the floor is on ground nobody has walked to.
   *
   * Scenery rather than a piece with eyes: a lamp, a note, a card left on the board. Ground
   * the party has cleared keeps showing what is on it, so this asks only whether the ground
   * has been walked to at all.
   */
  isPieceHiddenByFog(object: TabletopObject, sizeCells = 1): boolean {
    const scene = this.scene();
    if (!scene?.fogEnabled || !object.isVisibleOnTable || surfaceOf(object) !== 'floor') return false;
    const half = (scene.gridSize * Math.max(sizeCells, 0.25)) / 2;
    return this.isHiddenByFog(object.location.x + half, object.location.y + half);
  }

  /** What the fog over this table is made of, for whatever has to paint some of its own. */
  fogColor(): string {
    return this.currentTable()?.fogColor ?? DEFAULT_FOG_COLOR;
  }

  /**
   * Which of the cells a terrain stands on the party has walked to, in the terrain's own rows.
   *
   * A piece of terrain is one box however many cells it covers, and a box is drawn whole or
   * not at all, so the faces are cut to this instead. That keeps a wall gathered from a dozen
   * cells in one piece and still lets the fog lie across the part of it nobody has reached.
   */
  terrainFogCover(terrain: Terrain): TerrainFogCover | null {
    if (!this.active()) return null;
    const scene = this.scene();
    const cells = this.visionCells();
    if (!scene || !cells) return null;
    if (surfaceOf(terrain) !== 'floor') return null;

    // The game master is shown everything, and a table with the fog off hides nothing; both
    // still read their light cell by cell, or a long wall is answered for by its middle and
    // a wide one by ground beyond its own edge.
    const gm = this.viewer().isGameMaster;
    const explored = !gm && scene.fogEnabled ? this.exploredCells() : null;
    if (!gm && scene.fogEnabled && !explored) return null;

    const grid = cells.grid;
    const cols = Math.max(1, Math.round(terrain.width));
    const rows = Math.max(1, Math.round(terrain.depth));
    // Held against the explored set itself rather than in the scene-lifetime memo: the fog's
    // record changes without the scene changing, and a cover read through the memo then kept
    // answering for the record as it stood one step ago. With no record in play, the cells of
    // the scene stand in as the key.
    const memoKey: object = explored ?? cells;
    let byTerrain = this.coverMemo.get(memoKey);
    if (!byTerrain) {
      byTerrain = new Map();
      this.coverMemo.set(memoKey, byTerrain);
    }
    const key = `${terrain.identifier}:${terrain.location.x}:${terrain.location.y}:${terrain.rotate}:${cols}x${rows}`;
    const held = byTerrain.get(key);
    if (held) return held;
    const built = this.coverOf(terrain, grid, explored, cols, rows);
    byTerrain.set(key, built);
    return built;
  }

  private readonly coverMemo = new WeakMap<object, Map<string, TerrainFogCover>>();

  private coverOf(
    terrain: Terrain,
    grid: CellGrid,
    explored: CellBits | null,
    cols: number,
    rows: number
  ): TerrainFogCover {
    const size = grid.sizePx;
    const centreX = terrain.location.x + (cols * size) / 2;
    const centreY = terrain.location.y + (rows * size) / 2;
    const turn = (terrain.rotate * Math.PI) / 180;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);

    const scene = this.scene();
    const viewer = this.viewer();
    const blocking = this.blockingCells();
    // The game master sees every cell; a reader sees what the fog says they see.
    const visible = viewer.isGameMaster ? null : (this.overlayVision()?.visible ?? new CellBits(0));
    const dark = scene ? 1 - darknessAlphaFor(scene, viewer) : 1;

    const cleared: boolean[] = [];
    const brightness: number[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const localX = (col + 0.5 - cols / 2) * size;
        const localY = (row + 0.5 - rows / 2) * size;
        const x = centreX + localX * cos - localY * sin;
        const y = centreY + localX * sin + localY * cos;
        const cell = cellIndexAt(grid, x, y);
        const shown = cell >= 0 && (explored?.get(cell) ?? true);
        cleared.push(shown);
        brightness.push(
          shown && scene ? this.cellBrightness(scene, viewer, grid, blocking, visible, cell, x, y) : dark
        );
      }
    }
    return { cols, rows, cleared, brightness };
  }

  /**
   * How brightly one cell of a terrain is lit.
   *
   * A wall's cell is read at its open sides, never at its middle: the middle of a wall is
   * inside the wall, where its own edge stops the look and the light alike.
   */
  private cellBrightness(
    scene: VisionScene,
    viewer: SceneViewer,
    grid: CellGrid,
    blocking: CellBits | null,
    visible: CellBits | null,
    cell: number,
    x: number,
    y: number
  ): number {
    const dark = 1 - darknessAlphaFor(scene, viewer);
    // Ground the party has taken is held at full light, which is what the easy fog promises:
    // cleared once, and bright from then on however the lamps stand.
    if (this.clearedIsLit(cell)) return 1;
    // Bright exactly where the fog counts the cell as in sight right now. The fog's own
    // answer already holds the whole rule - lamplit and in a line of sight, read at a wall's
    // open sides - and it falls back to the party's shared sight for a reader with no piece
    // of their own. Asking the sight lines again here answered that reader with 'anything a
    // lamp touches', which lit the walls of rooms nobody could see into.
    if (visible && !visible.get(cell)) return dark;
    if (!blocking?.get(cell)) {
      return objectBrightnessFor(scene, viewer, x, y, grid.sizePx / 2, true);
    }
    let best = dark;
    forEachNeighbourCell(grid, cell, (neighbour) => {
      if (blocking.get(neighbour)) return;
      const open = cellCenterOf(grid, neighbour);
      const brightness = objectBrightnessFor(
        scene,
        viewer,
        x + (open.x - x) * FACE_READ_STEP,
        y + (open.y - y) * FACE_READ_STEP,
        0,
        true
      );
      if (brightness > best) best = brightness;
    });
    return best;
  }

  /** Whether this cell is ground the party took on a table that keeps what it has taken. */
  private clearedIsLit(cell: number): boolean {
    if (cell < 0) return false;
    const fog = this.overlayVision();
    return !!fog?.clearedStaysLit && fog.explored.get(cell);
  }

  isHiddenByFog(x: number, y: number): boolean {
    if (this.viewer().isGameMaster) return false;
    const explored = this.exploredCells();
    const cells = this.visionCells();
    if (!explored || !cells) return false;
    const index = cellIndexAt(cells.grid, x, y);
    if (index < 0) return false;
    return !explored.get(index);
  }

  /**
   * How bright a terrain is drawn, read where the fog has cleared rather than at its middle.
   *
   * A wall gathered from a dozen cells is drawn only where the party has reached it, and the
   * middle of such a wall is usually neither reached nor lit: read there, the one cell of it
   * standing beside a torch came out as black as the ten behind it.
   */
  terrainBrightness(terrain: Terrain, centreX: number, centreY: number, radiusPx: number): number {
    if (!this.active()) return 1;
    const scene = this.scene();
    if (!scene) return 1;
    const cover = this.terrainFogCover(terrain);
    // The top of a wall is a surface of its own, and a lamp level with it lights along it. Read
    // at the ground the wall stands on, a walkway beside a torch came out as dark as the floor
    // ten feet below, and so did whatever had climbed onto it.
    const top = (terrain.altitude + terrain.height) * scene.gridSize;
    if (!cover) return this.objectBrightness(centreX, centreY, radiusPx, true, top);

    return this.brightestCleared(cover);
  }

  /**
   * The brightest of the cells a terrain has been reached at.
   *
   * A wall's cell is read at its open sides, never at its middle: the middle of a wall is
   * inside the wall, where its own edge stops the look and the light alike, so the one cell
   * of it standing beside a torch came out as black as the ten behind it.
   */
  private brightestCleared(cover: TerrainFogCover): number {
    let best = 0;
    for (let i = 0; i < cover.cleared.length; i++) {
      if (cover.cleared[i] && cover.brightness[i] > best) best = cover.brightness[i];
    }
    return best;
  }

  /**
   * How bright a thing standing on the table comes out.
   *
   * `standingZ` is the surface it is standing on, not its own top: the ground for most of a
   * table, and the top of a wall for whatever has climbed onto one. Read against the ground
   * far below, a piece on a walkway level with a lamp came out dark beside it.
   */
  objectBrightness(x: number, y: number, radiusPx = 0, ignoreShadowCasters = false, standingZ = 0): number {
    if (!this.active()) return 1;
    const scene = this.scene();
    if (!scene) return 1;
    return this.recall(`bright:${x}:${y}:${radiusPx}:${ignoreShadowCasters}:${standingZ}`, () =>
      objectBrightnessFor(scene, this.viewer(), x, y, radiusPx, ignoreShadowCasters, standingZ)
    );
  }

  objectFilter(x: number, y: number, radiusPx = 0, ignoreShadowCasters = false, standingZ = 0): string | null {
    const brightness = this.objectBrightness(x, y, radiusPx, ignoreShadowCasters, standingZ);
    return brightness < 1 ? `brightness(${brightness.toFixed(3)})` : null;
  }

  wallSilhouettes(face: WallFace): WallSilhouette[] {
    if (!this.active()) return EMPTY_SILHOUETTES;
    const scene = this.seenScene();
    if (!scene) return EMPTY_SILHOUETTES;
    return this.recall(`sil:${faceKey(face)}`, () => computeWallSilhouettes(scene, face, scene.gridSize * 1.5));
  }

  wallLights(face: WallFace): WallLight[] {
    if (!this.active()) return EMPTY_WALL_LIGHTS;
    const scene = this.seenScene();
    if (!scene) return EMPTY_WALL_LIGHTS;
    return this.recall(`wl:${faceKey(face)}`, () => computeWallLights(scene, face));
  }

  /**
   * The scene as the reader has it, with the lamps they cannot see taken out of it.
   *
   * A wall lit on the far side of another wall is still a wall nobody can see, so the pool
   * and the shadows thrown on it are left off rather than shining through what hides them.
   *
   * A wall is painted at the darkness of the table and lit only where a pool falls on it, so
   * this is what keeps a lamp shut in a room from throwing its pool onto the walls of that
   * room for somebody standing outside. Asking instead whether the face as a whole could be
   * seen took the pools off a long wall whose middle happened to be dark, which is most of a
   * long wall.
   */
  private seenScene(): VisionScene | null {
    const scene = this.scene();
    if (!scene || this.viewer().isGameMaster) return scene;
    return this.recall('seen:scene', () => {
      const lights = scene.lights.filter((light) => this.lightIsSeen(scene, light));
      return lights.length === scene.lights.length ? scene : { ...scene, lights };
    });
  }

  private lightIsSeen(scene: VisionScene, light: SceneLight): boolean {
    const viewer = this.viewer();
    if (viewer.isGameMaster || light.revealToAll) return true;
    return this.recall(`lseen:${light.sourceId}`, () => isPointVisible(scene, light.x, light.y, viewer, light.z));
  }

  ambientBrightness(): number {
    if (!this.active()) return 1;
    const scene = this.scene();
    if (!scene) return 1;
    return 1 - darknessAlphaFor(scene, this.viewer());
  }

  private emissiveLights(): { lights: SceneLight[]; gridSize: number } {
    this.geometryEpoch();
    const table = this.currentTable();
    if (!table) return { lights: [], gridSize: 50 };
    const lights = collectLights(table, this.objectStore.getObjects(GameCharacter), table.gridSize, (identifier) =>
      this.objectStore.get<GameCharacter>(identifier)
    );
    const scene = this.scene();
    const seen = scene && this.active() ? lights.filter((light) => this.lightIsSeen(scene, light)) : lights;
    return { lights: seen, gridSize: table.gridSize };
  }

  lightBeams(): LightBeam[] {
    return this.recall('beams', () => {
      const beams: LightBeam[] = [];
      for (const light of this.emissiveLights().lights) {
        const beam = computeLightBeam(light);
        if (beam) beams.push(beam);
      }
      return beams;
    });
  }

  lightGlows(): LightGlow[] {
    return this.recall('glows', () => {
      const { lights, gridSize } = this.emissiveLights();
      const glows: LightGlow[] = [];
      for (const light of lights) {
        const glow = computeLightGlow(light, gridSize);
        if (glow) glows.push(glow);
      }
      return glows;
    });
  }

  isTokenVisible(character: GameCharacter): boolean {
    const scene = this.scene();
    if (!scene || !(scene.darknessEnabled || scene.fogEnabled)) return true;
    if (surfaceOf(character) !== 'floor') return true;
    const viewer = this.viewer();
    if (viewer.isGameMaster) return true;
    if (viewerShares(viewer, character.owner, character.partyIdentifier)) return true;
    const half = (scene.gridSize * (character.size || 1)) / 2;
    const x = character.location.x + half;
    const y = character.location.y + half;
    // Under fog the piece answers to the same cells the fog is drawn from. Asking the sight
    // lines again would answer for eyes the reader may not have: somebody with no piece of
    // their own has none, and a table with the dark switched off has nothing to stop a look,
    // so every piece on the board came out standing in plain view under the fog covering it.
    // A piece the party has met is followed wherever it goes, on a table that says so: what
    // is being read is the map the party keeps, and a monster they have seen is on it.
    if (this.foundPieces().has(character.identifier)) return true;
    const fog = scene.fogEnabled ? this.overlayVision() : undefined;
    if (fog) {
      const cell = cellIndexAt(fog.grid, x, y);
      // Ground the party has cleared keeps showing what stands on it, so a monster once
      // found stays found. It goes again the moment it steps somewhere nobody has been.
      if (cell >= 0) return fog.visible.get(cell) || (fog.rememberSeen && fog.explored.get(cell));
    }
    const z = eyeHeightPx(character.altitude, character.posZ, scene.gridSize);
    return this.recall(`tok:${x}:${y}:${z}`, () => isPointVisible(scene, x, y, viewer, z));
  }
}
