import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import type { GameCharacter } from '@axe/domain/character/game-character';
import type { TableCameraView } from '@axe/domain/tabletop/camera/table-camera';
import {
  type BoardPoint,
  DEFAULT_THIRD_PERSON_ORBIT,
  eyeBackFrom,
  lookDirection,
  orbitPushed,
  orbitTurned,
  perspectiveForFov,
  THIRD_PERSON_FOV_DEG,
  thirdPersonCameraView,
  type ThirdPersonOrbit,
} from '@axe/domain/tabletop/camera/third-person-camera';
import { firstPersonCeilings } from '@axe/domain/tabletop/first-person/first-person-eye';
import type { FirstPersonMove } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { roofHeightAt } from '@axe/domain/tabletop/first-person/first-person-roof';
import { cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { pieceCentreOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { pickFirst } from '@axe/domain/tabletop/pick/pick-index';
import type { TableWorldCap } from '@axe/domain/tabletop/world/table-world';

/** How high over the piece's foot the camera looks, in cells: about where its head is. */
const AIM_HEIGHT_CELLS = 0.8;
/** How far short of a block or the ground the camera stops, and how near the piece it may then come, in cells. */
const CLEARANCE_CELLS = 0.25;
const NEAREST_CELLS = 0.5;
/** How far apart the ground is read along the line from the piece to the camera, in cells. */
const GROUND_STEP_CELLS = 0.5;
/** How near the piece the camera may come, in cells, before the piece is drawn faint enough to see past. */
const SEE_THROUGH_CELLS = 1.5;
const GLIDE_MS = 160;
/** How far the piece may go in one move and still be glided after, in cells, rather than jumped to. */
const GLIDE_CELLS = 3;
const NO_CEILINGS: readonly TableWorldCap[] = [];

/** Where the camera looks and which way, before it stands back from there. */
interface Aim {
  readonly point: BoardPoint;
  readonly yawDeg: number;
}

/**
 * The camera that follows a piece about from behind it, over its shoulder, on a table drawn on a
 * canvas: the table's own camera, worked out afresh as the piece walks and turns, so the pieces, the
 * marks over them and what a press lands on all follow it. A drag turns the camera round the piece
 * and tips it, the wheel brings it nearer or further, and a block or the ground between the piece
 * and the camera brings it in short of them. Indoors it stays under the roof, which is drawn over
 * it. Which piece this seat follows is kept in this browser.
 */
@Injectable({ providedIn: 'root' })
export class ThirdPersonService {
  private readonly firstPerson = inject(FirstPersonService);
  private readonly table3d = inject(Table3dService);
  private readonly camera = inject(TableCameraService);
  private readonly eyes = inject(TableEyeService);
  private readonly pick = inject(TablePickService);
  private readonly ground = inject(GroundService);
  private readonly motion = inject(MotionService);

  private readonly followed = signal(readLocal(STORAGE_KEYS.tableFollow) ?? '');
  private readonly orbitNow = signal<ThirdPersonOrbit>(DEFAULT_THIRD_PERSON_ORBIT);
  private readonly shown = signal<Aim | null>(null);
  private frame: number | null = null;

  readonly orbit = this.orbitNow.asReadonly();

  /** The piece followed, while there is one this seat may follow on a table drawn on a canvas, and the eye stands in no piece. */
  readonly piece = computed<GameCharacter | null>(
    () => {
      const identifier = this.followed();
      if (!identifier || !this.table3d.drawsOnCanvas() || this.firstPerson.showing()) return null;
      const piece = this.firstPerson.usablePiece(identifier);
      return piece && this.firstPerson.canLookOutOf(piece) ? piece : null;
    },
    { equal: () => false }
  );

  readonly following = computed(() => this.piece() !== null);

  /** Where the camera looks now and which way: over the middle of the piece, the way it faces, turned as far as the camera is turned round it. */
  private readonly aim = computed<Aim | null>(
    () => {
      const piece = this.piece();
      const table = this.firstPerson.table();
      if (!piece || !table) return null;
      const g = table.gridSize;
      const middle = pieceCentreOf(piece, g);
      const foot = piece.posZ + piece.altitude * g + Math.max(0, this.ground.heightPxAt(middle.x, middle.y));
      return {
        point: { x: middle.x, y: middle.y, z: foot + AIM_HEIGHT_CELLS * g },
        yawDeg: piece.rotate + this.orbitNow().turnDeg,
      };
    },
    { equal: sameAim }
  );

  /** The ceilings over the rooms of the roof, drawn while the piece stands under it. */
  private readonly ceilings = computed<readonly TableWorldCap[]>(() => {
    const roofZ = this.roofOver();
    const roof = this.firstPerson.roof();
    const grid = this.firstPerson.grid();
    return roofZ === null || !roof || !grid ? NO_CEILINGS : firstPersonCeilings(roof, grid, -Infinity);
  });

  /** How far back the camera stands now, in table pixels, or null while no piece is followed. */
  private readonly boom = computed<number | null>(() => {
    const shown = this.shown();
    const table = this.firstPerson.table();
    if (!shown || !table || table.gridSize <= 0) return null;
    return this.boomFor(shown, this.orbitNow(), table.gridSize);
  });

  /** The table's camera, standing back from the piece, or null while no piece is followed. */
  readonly view = computed<TableCameraView | null>(
    () => {
      const shown = this.shown();
      const boom = this.boom();
      this.camera.layoutVersion();
      const layout = this.camera.layout;
      if (!shown || boom === null || !layout) return null;
      const orbit = this.orbitNow();
      const eye = eyeBackFrom(shown.point, shown.yawDeg, orbit.downDeg, boom);
      return thirdPersonCameraView(
        eye,
        shown.yawDeg,
        orbit.downDeg,
        layout,
        perspectiveForFov(layout.height, THIRD_PERSON_FOV_DEG)
      );
    },
    { equal: sameView }
  );

  constructor() {
    effect(() => {
      const aim = this.aim();
      untracked(() => this.glideTo(aim));
    });
    effect(() => {
      const ceilings = this.ceilings();
      untracked(() => this.eyes.showOverhead(ceilings));
    });
    effect(() => {
      const piece = this.piece();
      const boom = this.boom();
      const g = this.firstPerson.table()?.gridSize ?? 0;
      const followed = piece ? { owner: piece.identifier, near: boom !== null && boom < SEE_THROUGH_CELLS * g } : null;
      untracked(() => this.eyes.showFollowed(followed));
    });
  }

  /** Follows a piece from behind, starting over its shoulder, and remembers it for this browser. */
  follow(identifier: string): void {
    this.orbitNow.set(DEFAULT_THIRD_PERSON_ORBIT);
    this.followed.set(identifier);
    writeLocal(STORAGE_KEYS.tableFollow, identifier);
  }

  /** Stops following, giving the table its own camera back. */
  stop(): void {
    this.followed.set('');
    writeLocal(STORAGE_KEYS.tableFollow, null);
  }

  /** Whether this piece is the one followed. */
  isFollowing(identifier: string): boolean {
    return this.followed() === identifier && this.following();
  }

  /** Turns the camera round the piece and tips it, in degrees. */
  turnBy(turnDeg: number, downDeg: number): void {
    this.orbitNow.update((orbit) => orbitTurned(orbit, turnDeg, downDeg));
  }

  /** Brings the camera nearer the piece, or with a negative number takes it further back, in cells. */
  nearerBy(cells: number): void {
    this.orbitNow.update((orbit) => orbitPushed(orbit, -cells));
  }

  /** Walks the piece followed one step, as the first-person view walks the piece it looks out of. */
  walk(move: FirstPersonMove): Promise<boolean> {
    const piece = this.piece();
    return piece ? this.firstPerson.walkPiece(piece, move) : Promise.resolve(false);
  }

  turn(turn: 1 | -1): Promise<boolean> {
    const piece = this.piece();
    return piece ? this.firstPerson.turnPiece(piece, turn) : Promise.resolve(false);
  }

  /** The height of the roof over the piece, or null where it stands under none. */
  private roofOver(): number | null {
    const shown = this.aim();
    const roof = this.firstPerson.roof();
    const grid = this.firstPerson.grid();
    if (!shown || !roof || !grid) return null;
    const cell = cellIndexAt(grid, shown.point.x, shown.point.y);
    return cell >= 0 && roof.cells.get(cell) ? roofHeightAt(roof, cell) : null;
  }

  /**
   * How far back the camera stands: as far as the orbit asks, brought in short of a block or the
   * ground in the way, and under the roof where the piece stands under one.
   */
  private boomFor(aim: Aim, orbit: ThirdPersonOrbit, g: number): number {
    const way = lookDirection(aim.yawDeg, orbit.downDeg);
    const back = { x: -way.x, y: -way.y, z: -way.z };
    const nearest = NEAREST_CELLS * g;
    let boom = orbit.boomCells * g;
    const hit = pickFirst(this.pick.targets(), { origin: aim.point, direction: back });
    if (hit && hit.t < boom) boom = Math.max(nearest, hit.t - CLEARANCE_CELLS * g);
    for (let along = GROUND_STEP_CELLS * g; along <= boom; along += GROUND_STEP_CELLS * g) {
      const x = aim.point.x + back.x * along;
      const y = aim.point.y + back.y * along;
      const floor = Math.max(0, this.ground.heightPxAt(x, y)) + CLEARANCE_CELLS * g;
      if (aim.point.z + back.z * along < floor) {
        boom = Math.max(nearest, along - GROUND_STEP_CELLS * g);
        break;
      }
    }
    const roofZ = untracked(() => this.roofOver());
    if (roofZ !== null && back.z > 0) {
      boom = Math.max(nearest, Math.min(boom, (roofZ - CLEARANCE_CELLS * g - aim.point.z) / back.z));
    }
    return boom;
  }

  /** Glides the camera after the piece over a moment, or jumps there for a long move or with motion off. */
  private glideTo(aim: Aim | null): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    const from = this.shown();
    const g = this.firstPerson.table()?.gridSize ?? 0;
    if (
      !aim ||
      !from ||
      !this.motion.enabled() ||
      Math.hypot(aim.point.x - from.point.x, aim.point.y - from.point.y) > GLIDE_CELLS * g
    ) {
      this.shown.set(aim);
      return;
    }
    const turn = ((((aim.yawDeg - from.yawDeg) % 360) + 540) % 360) - 180;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      const eased = t * (2 - t);
      this.shown.set({
        point: {
          x: from.point.x + (aim.point.x - from.point.x) * eased,
          y: from.point.y + (aim.point.y - from.point.y) * eased,
          z: from.point.z + (aim.point.z - from.point.z) * eased,
        },
        yawDeg: from.yawDeg + turn * eased,
      });
      this.frame = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.frame = requestAnimationFrame(step);
  }
}

function sameAim(a: Aim | null, b: Aim | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.yawDeg === b.yawDeg && a.point.x === b.point.x && a.point.y === b.point.y && a.point.z === b.point.z;
}

function sameView(a: TableCameraView | null, b: TableCameraView | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.positionX === b.positionX &&
    a.positionY === b.positionY &&
    a.positionZ === b.positionZ &&
    a.rotateX === b.rotateX &&
    a.rotateZ === b.rotateZ &&
    a.perspectivePx === b.perspectivePx
  );
}
