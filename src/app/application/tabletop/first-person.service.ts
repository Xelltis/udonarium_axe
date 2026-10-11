import { computed, inject, Injectable, signal } from '@angular/core';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MoveRangeService } from '@axe/application/tabletop/move-range.service';
import { PieceStepService } from '@axe/application/tabletop/piece-step.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { FirstPersonPreferenceService } from '@axe/application/ui/first-person-preference.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  directionOf,
  eyePoseAt,
  facingIndexOf,
  FIRST_PERSON_EYE_HEIGHT_CELLS,
  FirstPersonLattice,
  FirstPersonMove,
  FirstPersonPose,
  headingVector,
  latticeOf,
  rotateOfFacing,
  snappedRotate,
  turnedRotate,
} from '@axe/domain/tabletop/first-person/first-person-lattice';
import { FirstPersonRoof, firstPersonRoofOf } from '@axe/domain/tabletop/first-person/first-person-roof';
import { FIRST_PERSON_FOV_DEG } from '@axe/domain/tabletop/first-person/first-person-scene';
import { FirstPersonSeat, firstPersonSeats } from '@axe/domain/tabletop/first-person/first-person-seats';
import {
  FirstPersonTarget,
  firstPersonTarget,
  sharedViewPieceOf,
} from '@axe/domain/tabletop/first-person/first-person-target';
import { FirstPersonWorld, firstPersonWorldOf } from '@axe/domain/tabletop/first-person/first-person-world';
import { freeStepClear } from '@axe/domain/tabletop/first-person/free-step';
import { MinimapView, minimapViewOf } from '@axe/domain/tabletop/first-person/minimap-view';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellGridOf, CellPoint, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { computeVisibleCellsFor } from '@axe/domain/tabletop/fog/visible-cells';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { blockedByTerrain } from '@axe/domain/tabletop/move/blocked-cells';
import { moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { moveNeighbourToward } from '@axe/domain/tabletop/move/move-neighbours';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { resolveRoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
import { SceneVisionSource } from '@axe/domain/tabletop/vision-scene';
import { facingBearing } from '@axe/domain/tabletop/vision-shape';
import { applyLightPreset, LightPreset, VisionType } from '@axe/domain/tabletop/vision-types';

/** How far the view draws, in cells. What lies past the clear distance is drawn blurred. */
export const FIRST_PERSON_DEPTH_CELLS = 12;
/** How far the view draws sharp, in cells; between here and the depth it is drawn more and more blurred. */
export const FIRST_PERSON_CLEAR_CELLS = 6;
const SIGHT_MARGIN_DEG = 40;
/**
 * How far in from its corners a cell is looked for when its middle is hidden, as a share of the way
 * to the middle: ground and walls round a corner are drawn as far as a wall's corner would really
 * leave them in view, rather than left black for want of their middles.
 */
const SIGHT_CORNER_INSET = 0.1;

/** How brightly a cell of ground is drawn: seen now, or only remembered. */
export type FirstPersonCellTier = 'lit' | 'dim';

type Action = () => Promise<boolean>;

@Injectable({ providedIn: 'root' })
export class FirstPersonService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly preference = inject(FirstPersonPreferenceService);
  private readonly vision = inject(VisionService);
  private readonly moveRange = inject(MoveRangeService);
  private readonly movePlan = inject(MovePlanService);
  private readonly pieceStep = inject(PieceStepService);
  private readonly replay = inject(ReplayPlaybackService);

  private readonly worldEpoch = signal(0);

  /** Whether the screen is looking about, which needs the sight all round rather than ahead alone. */
  private readonly lookingAround = signal(false);
  private busy = false;
  private queued: Action | null = null;

  constructor() {
    this.objectChange.onObjectChangedForAlias([Terrain.aliasName, 'move-block-map'], () =>
      this.worldEpoch.update((epoch) => epoch + 1)
    );
  }

  readonly table = computed<GameTable | null>(
    () => {
      this.objectChange.versionOf(this.tableSelecter.identifier)();
      const table = this.tableSelecter.viewTable;
      if (table) this.objectChange.versionOf(table.identifier)();
      return table;
    },
    { equal: () => false }
  );

  readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  readonly gmPresent = computed(() => {
    this.objectChange.collectionOf('PeerCursor')();
    let present = false;
    for (const cursor of this.objectStore.getObjects<PeerCursor>(PeerCursor)) {
      this.objectChange.versionOf(cursor.identifier)();
      if (cursor.isGameMaster) present = true;
    }
    return present;
  });

  readonly sharedPiece = computed(() => sharedViewPieceOf(this.table()));

  readonly sharedUsable = computed(() => {
    const table = this.table();
    const piece = sharedViewPieceOf(table);
    return piece !== '' && table !== null && this.pieceOn(table, piece) !== null;
  });

  readonly target = computed<FirstPersonTarget | null>(() => {
    const table = this.table();
    if (!table) return null;
    return firstPersonTarget(
      {
        shared: sharedViewPieceOf(table),
        seat: this.preference.piece(),
        isGameMaster: this.isGameMaster(),
        gmPresent: this.gmPresent(),
      },
      (identifier) => this.pieceOn(table, identifier) !== null
    );
  });

  readonly showing = computed(() => this.target() !== null);

  readonly forced = computed(() => this.target()?.shared === true);

  readonly piece = computed<GameCharacter | null>(
    () => {
      const target = this.target();
      const table = this.table();
      return target && table ? this.pieceOn(table, target.piece) : null;
    },
    { equal: () => false }
  );

  readonly lattice = computed<FirstPersonLattice>(() => latticeOf(this.table()?.gridType ?? GridType.SQUARE));

  readonly grid = computed<CellGrid | null>(() => this.vision.cellGrid());

  readonly world = computed<FirstPersonWorld | null>(() => {
    this.worldEpoch();
    const table = this.table();
    return table ? firstPersonWorldOf(table, table.terrains) : null;
  });

  /** The roof over the ground the board's walls shut in, worked out from the board, not the eye. */
  readonly roof = computed<FirstPersonRoof | null>(() => {
    this.worldEpoch();
    const table = this.table();
    const grid = this.grid();
    const world = this.world();
    return table && grid && world ? firstPersonRoofOf(grid, table.terrains, world) : null;
  });

  readonly depthPx = computed(() => FIRST_PERSON_DEPTH_CELLS * (this.table()?.gridSize ?? 0));

  /** How far the view draws sharp, in table pixels. */
  readonly clearPx = computed(() => FIRST_PERSON_CLEAR_CELLS * (this.table()?.gridSize ?? 0));

  readonly pose = computed<FirstPersonPose | null>(
    () => {
      const piece = this.piece();
      const table = this.table();
      const grid = this.grid();
      if (!piece || !table || !grid) return null;
      const standing = this.standingPoint(piece, table, grid);
      if (!standing) return null;
      const yaw = snappedRotate(this.lattice(), piece.rotate);
      const eyeZ = (piece.altitude + FIRST_PERSON_EYE_HEIGHT_CELLS) * table.gridSize + piece.posZ;
      return eyePoseAt(standing, yaw, eyeZ, table.gridSize);
    },
    { equal: samePose }
  );

  /**
   * The ground the eye reaches by line of sight alone, with the light on the table left out.
   *
   * The game master is shown the room as it stands rather than as a lamp happens to light it,
   * and ground the party has walked before is drawn from here as well: it is remembered, so it
   * is still there to be drawn, however dark it has gone since.
   */
  private readonly reach = computed<CellBits | null>(() => this.eyeCells(true));

  readonly sight = computed<CellBits | null>(() => (this.isGameMaster() ? this.reach() : this.eyeCells(false)));

  readonly reveal = computed<CellBits | null>(() => {
    if (this.isGameMaster()) return null;
    const overlay = this.vision.overlayVision();
    if (!overlay) return null;
    const reveal = overlay.visible.copy();
    if (overlay.rememberSeen) reveal.or(overlay.explored);
    return reveal;
  });

  /** Ground the party has been shown and keeps, which the game master has no record of. */
  private readonly remembered = computed<CellBits | null>(() => {
    if (this.isGameMaster()) return null;
    const overlay = this.vision.overlayVision();
    return overlay?.rememberSeen ? overlay.explored : null;
  });

  /** The cells in plain sight from the eye, cut back to what the table shows this seat. */
  readonly litCells = computed<CellBits | null>(() => {
    const sight = this.sight();
    if (!sight) return null;
    const overlay = this.vision.overlayVision();
    if (this.isGameMaster() || !overlay || overlay.visible.count !== sight.count) return sight;
    const lit = sight.copy();
    lit.and(overlay.visible);
    return lit;
  });

  /**
   * Ground the eye reaches that the party remembers rather than sees, for drawing darker. A seat
   * that remembers nothing never asks how far the eye reaches in the dark, which is a second pass
   * over the board.
   */
  readonly dimCells = computed<CellBits | null>(() => {
    const lit = this.litCells();
    if (!lit) return null;
    const remembered = this.remembered();
    if (!remembered || remembered.count !== lit.count) return new CellBits(lit.count);
    const reach = this.reach();
    if (!reach || reach.count !== lit.count) return new CellBits(lit.count);
    const dim = reach.copy();
    dim.and(remembered);
    dim.without(lit);
    return dim;
  });

  /** Everything the scene is asked to draw: what is in sight now, and what is remembered. */
  readonly seen = computed<CellBits | null>(() => {
    const lit = this.litCells();
    if (!lit) return null;
    const dim = this.dimCells();
    if (!dim || dim.isEmpty) return lit;
    const both = lit.copy();
    both.or(dim);
    return both;
  });

  tierOfCell(cell: number): FirstPersonCellTier | null {
    if (this.litCells()?.get(cell)) return 'lit';
    if (this.dimCells()?.get(cell)) return 'dim';
    return null;
  }

  /**
   * The cells the eye has a line of sight to, looked at from the height the view is drawn from, so
   * what the eye is drawn looking over it also sees over.
   */
  private eyeCells(ignoreDarkness: boolean): CellBits | null {
    const pose = this.pose();
    const piece = this.piece();
    const built = this.vision.scene();
    const grid = this.grid();
    const indexes = this.vision.sightIndexes();
    if (!pose || !piece || !built || !grid || !indexes) return null;
    const scene = ignoreDarkness && built.darknessEnabled ? { ...built, darknessEnabled: false } : built;
    const blocking = this.vision.blockingCells();
    const own = scene.visionSources.find((source) => source.sourceId === piece.identifier);
    const depth = this.depthPx();
    const eye: SceneVisionSource = {
      ...(own ?? { type: VisionType.NORMAL, owner: piece.owner, sourceId: piece.identifier }),
      x: pose.x,
      y: pose.y,
      z: pose.z,
      rangePx:
        own && own.rangePx > 0 && !ignoreDarkness && scene.darknessEnabled ? Math.min(own.rangePx, depth) : depth,
      direction: facingBearing(pose.yaw),
      lobes: [
        { direction: 0, angle: this.lookingAround() ? 360 : FIRST_PERSON_FOV_DEG + SIGHT_MARGIN_DEG, rangeScale: 1 },
      ],
    };
    return computeVisibleCellsFor(eye, {
      scene,
      grid,
      indexes,
      blocking: blocking?.cells,
      blockingTops: blocking?.tops,
      blockingBases: blocking?.bases,
      cornerInset: SIGHT_CORNER_INSET,
    });
  }

  /**
   * The board as the minimap draws it - its walls, the ground nobody may enter and its doors -
   * worked out again only when the board changes, not at every step and turn of the eye.
   */
  private readonly minimapGround = computed(() => {
    this.worldEpoch();
    const table = this.table();
    const grid = this.grid();
    if (!table || !grid) return null;
    const doors = new Map<number, boolean>();
    for (const terrain of table.terrains) {
      if (!terrain.isDoor || surfaceOf(terrain) !== 'floor') continue;
      const box = terrainBoxOf(terrain, table.gridSize);
      forEachCellInBox(grid, box.minX, box.minY, box.maxX, box.maxY, (cell) => doors.set(cell, terrain.isDoorOpen));
    }
    return {
      grid,
      walls: blockedByTerrain(grid, table.terrains),
      noEntry: moveBlockMapOn(table)?.read(grid) ?? null,
      doors,
    };
  });

  /** The minimap round the eye: the board as it stands, cut to what this seat has been shown. */
  readonly minimap = computed<MinimapView | null>(() => {
    const ground = this.minimapGround();
    const pose = this.pose();
    if (!ground || !pose) return null;
    return minimapViewOf({ ...ground, reveal: this.reveal() }, pose);
  });

  readonly canWalk = computed(() => {
    const piece = this.piece();
    if (!piece) return false;
    this.objectChange.trackMyCursor();
    const me = PeerCursor.myCursor;
    if (!me || me.isGuest) return false;
    if (piece.isLock || this.movePlan.isPlanning() || this.replay.isOpen()) return false;
    if (me.isGameMaster) return true;
    // A view the game master has put up for the room is the owner's to walk and everyone
    // else's to watch. A piece nobody has claimed is anyone's on the table, but here it is
    // the game master's alone: they are the one who set it out in front of the room.
    if (this.forced()) return piece.owner.length > 0 && isControllableByUser(piece, me.userId);
    return isControllableByUser(piece, me.userId);
  });

  /** Whether the piece being looked out of is carrying its own light. */
  readonly torchLit = computed(() => this.piece()?.lightEnabled === true);

  /**
   * Works the sight out all round while the screen looks about, so whatever way the eye turns finds
   * the ground drawn, and back to what lies ahead once it looks where the piece faces again. The
   * sight is worked out once for each, not for every step of a look.
   */
  lookAround(on: boolean): void {
    this.lookingAround.set(on);
  }

  toggleTorch(): boolean {
    const piece = this.piece();
    if (!piece || !this.canWalk()) return false;
    if (piece.lightEnabled) {
      piece.lightEnabled = false;
      return true;
    }
    if (piece.lightBrightRadius <= 0 && piece.lightDimRadius <= 0) applyLightPreset(piece, LightPreset.TORCH);
    piece.lightEnabled = true;
    return true;
  }

  /**
   * The pieces this seat may look out of: those it may move, standing where a view can be drawn
   * from. Every piece is watched, not only those that qualify, so a piece handed over or brought
   * back onto the table joins the list as it happens.
   */
  readonly seats = computed<FirstPersonSeat[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.trackMyCursor();
    this.table();
    const characters = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    for (const character of characters) this.objectChange.versionOf(character.identifier)();
    return firstPersonSeats(characters, PeerCursor.myCursor?.userId ?? '', (character) => this.canLookOutOf(character));
  });

  canLookOutOf(piece: GameCharacter): boolean {
    const table = this.table();
    return table !== null && this.pieceOn(table, piece.identifier) !== null;
  }

  enterSeat(identifier: string): void {
    this.preference.choose(identifier);
  }

  exitSeat(): void {
    this.preference.forget();
  }

  share(identifier: string | null): void {
    const table = this.table();
    if (!table || !this.isGameMaster()) return;
    table.sharedViewPiece = identifier ?? '';
  }

  walk(move: FirstPersonMove): Promise<boolean> {
    return this.enqueue(() => this.stepOnce(move));
  }

  turn(turn: 1 | -1): Promise<boolean> {
    return this.enqueue(async () => {
      const piece = this.piece();
      if (!piece || !this.canWalk()) return false;
      piece.rotate = turnedRotate(this.lattice(), piece.rotate, turn);
      return true;
    });
  }

  toggleDoorAhead(): boolean {
    const piece = this.piece();
    const table = this.table();
    const grid = this.grid();
    if (!piece || !table || !grid || !this.canWalk()) return false;
    const probes = this.doorProbes(piece, table, grid);
    for (const probe of probes) {
      for (const terrain of table.terrains) {
        if (!terrain.isDoor || surfaceOf(terrain) !== 'floor') continue;
        const box = terrainBoxOf(terrain, table.gridSize);
        if (probe.x < box.minX || probe.x > box.maxX || probe.y < box.minY || probe.y > box.maxY) continue;
        terrain.isDoorOpen = !terrain.isDoorOpen;
        SoundEffect.play(terrain.isDoorOpen ? PresetSound.unlock : PresetSound.lock);
        return true;
      }
    }
    return false;
  }

  /**
   * The piece by that identifier where it can be looked out of: on the table, standing on the
   * floor, and on a board with squares or hexes, on one of them, since the eye stands at the
   * middle of the cell under it.
   */
  private pieceOn(table: GameTable, identifier: string): GameCharacter | null {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.versionOf(identifier)();
    const piece = this.objectStore.get<GameCharacter>(identifier);
    if (!(piece instanceof GameCharacter)) return null;
    if (!piece.isVisibleOnTable || surfaceOf(piece) !== 'floor') return null;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    if (table.gridType !== GridType.NONE) {
      const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
      if (pieceCellOf(grid, piece, table.gridSize) < 0) return null;
    }
    return piece;
  }

  private standingPoint(piece: GameCharacter, table: GameTable, grid: CellGrid): CellPoint | null {
    if (table.gridType === GridType.NONE) {
      const half = (Math.max(1, piece.size) * table.gridSize) / 2;
      return { x: piece.location.x + half, y: piece.location.y + half };
    }
    const cell = pieceCellOf(grid, piece, table.gridSize);
    return cell >= 0 ? cellCenterOf(grid, cell) : null;
  }

  private doorProbes(piece: GameCharacter, table: GameTable, grid: CellGrid): CellPoint[] {
    const lattice = this.lattice();
    const standing = this.standingPoint(piece, table, grid);
    if (!standing) return [];
    if (lattice.kind === 'free') {
      const heading = headingVector(snappedRotate(lattice, piece.rotate));
      const reach = (cells: number) => ({
        x: standing.x + heading.x * table.gridSize * cells,
        y: standing.y + heading.y * table.gridSize * cells,
      });
      return [reach(0.5), reach(1), standing];
    }
    const cell = pieceCellOf(grid, piece, table.gridSize);
    const ahead = moveNeighbourToward(grid, cell, facingIndexOf(lattice, piece.rotate));
    return ahead >= 0 ? [cellCenterOf(grid, ahead), standing] : [standing];
  }

  /**
   * The pieces a step on a gridless table may not walk into: those standing on the floor that this
   * seat can see. A piece the dark or the fog hides does not stop a step, as on a grid, or the
   * refusal would tell of a piece nobody could see.
   */
  private othersOf(piece: GameCharacter, table: GameTable): CellPoint[] {
    const rules = resolveRoomRules(this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null, table);
    if (rules.piecesShareCells) return [];
    const others: CellPoint[] = [];
    for (const other of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (other.identifier === piece.identifier || !other.isVisibleOnTable || surfaceOf(other) !== 'floor') continue;
      if (!this.vision.isTokenVisible(other)) continue;
      const half = (Math.max(1, other.size) * table.gridSize) / 2;
      others.push({ x: other.location.x + half, y: other.location.y + half });
    }
    return others;
  }

  private async stepOnce(move: FirstPersonMove): Promise<boolean> {
    const piece = this.piece();
    const table = this.table();
    const grid = this.grid();
    if (!piece || !table || !grid || !this.canWalk() || this.movePlan.isWalking) return false;
    const lattice = this.lattice();
    const direction = directionOf(lattice, piece.rotate, move);
    if (direction === null) return false;
    if (lattice.kind === 'free') {
      const from = this.standingPoint(piece, table, grid);
      if (!from) return false;
      const heading = headingVector(rotateOfFacing(lattice, direction));
      const to = { x: from.x + heading.x * table.gridSize, y: from.y + heading.y * table.gridSize };
      const ground = {
        widthPx: table.width * table.gridSize,
        heightPx: table.height * table.gridSize,
        gridSize: table.gridSize,
        terrains: table.terrains,
        others: this.othersOf(piece, table),
      };
      if (!freeStepClear(from, to, ground)) return this.blocked();
      await this.pieceStep.stepToPoint(piece, table, to, true);
      return this.stepped();
    }
    const from = pieceCellOf(grid, piece, table.gridSize);
    const to = moveNeighbourToward(grid, from, direction);
    if (to < 0 || !this.moveRange.canStepTo(piece, to)) return this.blocked();
    await this.pieceStep.step(piece, table, grid, to, true);
    return this.stepped();
  }

  private stepped(): true {
    SoundEffect.play(PresetSound.piecePut);
    return true;
  }

  private blocked(): false {
    SoundEffect.play(PresetSound.blockPut);
    return false;
  }

  private enqueue(action: Action): Promise<boolean> {
    if (this.busy) {
      this.queued = action;
      return Promise.resolve(false);
    }
    return this.run(action);
  }

  private async run(action: Action): Promise<boolean> {
    this.busy = true;
    try {
      return await action();
    } finally {
      this.busy = false;
      const next = this.queued;
      this.queued = null;
      if (next) void this.run(next);
    }
  }
}

function samePose(a: FirstPersonPose | null, b: FirstPersonPose | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw;
}
