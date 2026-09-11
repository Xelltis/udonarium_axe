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
  FirstPersonLattice,
  FirstPersonMove,
  FirstPersonPose,
  headingVector,
  latticeOf,
  rotateOfFacing,
  snappedRotate,
  turnedRotate,
} from '@axe/domain/tabletop/first-person/first-person-lattice';
import { FIRST_PERSON_FOV_DEG } from '@axe/domain/tabletop/first-person/first-person-scene';
import {
  FirstPersonTarget,
  firstPersonTarget,
  sharedViewPieceOf,
} from '@axe/domain/tabletop/first-person/first-person-target';
import { FirstPersonWorld, firstPersonWorldOf } from '@axe/domain/tabletop/first-person/first-person-world';
import { freeStepClear } from '@axe/domain/tabletop/first-person/free-step';
import { MinimapView, minimapViewOf } from '@axe/domain/tabletop/first-person/minimap-view';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, CellPoint, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
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
import { eyeHeightPx, SceneVisionSource } from '@axe/domain/tabletop/vision-scene';
import { facingBearing } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

export const FIRST_PERSON_DEPTH_CELLS = 6;
const SIGHT_MARGIN_DEG = 40;

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

  readonly depthPx = computed(() => FIRST_PERSON_DEPTH_CELLS * (this.table()?.gridSize ?? 0));

  readonly pose = computed<FirstPersonPose | null>(
    () => {
      const piece = this.piece();
      const table = this.table();
      const grid = this.grid();
      if (!piece || !table || !grid) return null;
      const standing = this.standingPoint(piece, table, grid);
      if (!standing) return null;
      const yaw = snappedRotate(this.lattice(), piece.rotate);
      return eyePoseAt(standing, yaw, eyeHeightPx(piece.altitude, piece.posZ, table.gridSize), table.gridSize);
    },
    { equal: samePose }
  );

  readonly sight = computed<CellBits | null>(() => {
    const pose = this.pose();
    const piece = this.piece();
    const scene = this.vision.scene();
    const grid = this.grid();
    const indexes = this.vision.sightIndexes();
    if (!pose || !piece || !scene || !grid || !indexes) return null;
    const blocking = this.vision.blockingCells();
    const own = scene.visionSources.find((source) => source.sourceId === piece.identifier);
    const depth = this.depthPx();
    const eye: SceneVisionSource = {
      ...(own ?? { type: VisionType.NORMAL, owner: piece.owner, sourceId: piece.identifier }),
      x: pose.x,
      y: pose.y,
      z: pose.z,
      rangePx: own && own.rangePx > 0 ? Math.min(own.rangePx, depth) : depth,
      direction: facingBearing(pose.yaw),
      lobes: [{ direction: 0, angle: FIRST_PERSON_FOV_DEG + SIGHT_MARGIN_DEG, rangeScale: 1 }],
    };
    return computeVisibleCellsFor(eye, {
      scene,
      grid,
      indexes,
      blocking: blocking?.cells,
      blockingTops: blocking?.tops,
      blockingBases: blocking?.bases,
    });
  });

  readonly reveal = computed<CellBits | null>(() => {
    if (this.isGameMaster()) return null;
    const overlay = this.vision.overlayVision();
    if (!overlay) return null;
    const reveal = overlay.visible.copy();
    if (overlay.rememberSeen) reveal.or(overlay.explored);
    return reveal;
  });

  readonly seen = computed<CellBits | null>(() => {
    const sight = this.sight();
    if (!sight) return null;
    const reveal = this.reveal();
    if (!reveal || reveal.count !== sight.count) return sight;
    const both = sight.copy();
    for (let cell = 0; cell < both.count; cell++) {
      if (both.get(cell) && !reveal.get(cell)) both.unset(cell);
    }
    return both;
  });

  readonly minimap = computed<MinimapView | null>(() => {
    this.worldEpoch();
    const table = this.table();
    const grid = this.grid();
    const pose = this.pose();
    if (!table || !grid || !pose) return null;
    const doors = new Map<number, boolean>();
    for (const terrain of table.terrains) {
      if (!terrain.isDoor || surfaceOf(terrain) !== 'floor') continue;
      const box = terrainBoxOf(terrain, table.gridSize);
      forEachCellInBox(grid, box.minX, box.minY, box.maxX, box.maxY, (cell) => doors.set(cell, terrain.isDoorOpen));
    }
    return minimapViewOf(
      {
        grid,
        walls: blockedByTerrain(grid, table.terrains),
        noEntry: moveBlockMapOn(table)?.read(grid) ?? null,
        doors,
        reveal: this.reveal(),
      },
      pose
    );
  });

  readonly canWalk = computed(() => {
    const piece = this.piece();
    if (!piece) return false;
    this.objectChange.trackMyCursor();
    const me = PeerCursor.myCursor;
    if (!me || me.isGuest) return false;
    if (piece.isLock || this.movePlan.isPlanning() || this.replay.isOpen()) return false;
    return me.isGameMaster || isControllableByUser(piece, me.userId);
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

  private pieceOn(table: GameTable, identifier: string): GameCharacter | null {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.versionOf(identifier)();
    const piece = this.objectStore.get<GameCharacter>(identifier);
    if (!(piece instanceof GameCharacter)) return null;
    if (!piece.isVisibleOnTable || surfaceOf(piece) !== 'floor') return null;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
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

  private othersOf(piece: GameCharacter, table: GameTable): CellPoint[] {
    const rules = resolveRoomRules(this.objectStore.get<Config>('Config')?.roomRuleAnswers ?? null, table);
    if (rules.piecesShareCells) return [];
    const others: CellPoint[] = [];
    for (const other of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (other.identifier === piece.identifier || !other.isVisibleOnTable || surfaceOf(other) !== 'floor') continue;
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
      if (!freeStepClear(from, to, ground)) return false;
      await this.pieceStep.stepToPoint(piece, table, to, true);
      return true;
    }
    const from = pieceCellOf(grid, piece, table.gridSize);
    const to = moveNeighbourToward(grid, from, direction);
    if (to < 0 || !this.moveRange.canStepTo(piece, to)) return false;
    await this.pieceStep.step(piece, table, grid, to, true);
    return true;
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
