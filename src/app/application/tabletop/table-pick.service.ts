import { inject, Injectable, untracked } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TableAmbienceService } from '@axe/application/tabletop/table-ambience.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { pageOfTablePoint, tableEyeMatrix, TableRay, tableRayOfPage } from '@axe/domain/tabletop/camera/table-camera';
import { groundLiftOfBlock } from '@axe/domain/tabletop/ground/ground-surface';
import { AMBIENCE_PICK_LAYER, ambiencePickTarget } from '@axe/domain/tabletop/pick/ambience-pick';
import { faceTarget } from '@axe/domain/tabletop/pick/face-pick';
import { PickCylinder, PickShape } from '@axe/domain/tabletop/pick/pick-geometry';
import { pickAll, pickFirst, PickHit, PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { beamPickTarget, TERRAIN_PICK_LAYER, terrainPickTarget } from '@axe/domain/tabletop/pick/terrain-pick';
import { tableWallSettings } from '@axe/domain/tabletop/table-walls';
import { boardSurfaceOf, surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { lyingPlaceOfOwners } from '@axe/domain/tabletop/world/lying-order';
import { COIN_KIND, TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import { eyeAxesOf, spriteBoxCorners, spriteCorners, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { AlphaMask, seesThroughAt } from '@axe/domain/ui/see-through';

/**
 * Says what a point of the page lands on among the things on the table, by running the line of
 * sight through it against the shapes those things make, rather than by asking the page what is
 * drawn there.
 *
 * Terrain on the floor and on the white boards and the beams put on the walls are picked, and so
 * are the faces things are put on and the pieces, by the shapes the canvas draws them with, and the
 * looks laid over the ground, by the part of the floor each covers.
 */
/** How much nearer the eye than a point a piece must stand to hide it, in table pixels, so that one lying on it does not. */
const HIDDEN_SLACK_PX = 1;

@Injectable({
  providedIn: 'root',
})
export class TablePickService {
  private readonly ground = inject(StandingGroundService);
  private readonly tabletop = inject(TabletopService);
  private readonly vision = inject(VisionService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly camera = inject(TableCameraService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly images = inject(ImageService);
  private readonly coordinates = inject(CoordinateService);
  private readonly pointerDevice = inject(PointerDeviceService);
  private readonly pieces = inject(TablePiecesService);
  private readonly pictures = inject(PictureSizeService);
  private readonly looks = inject(TableAmbienceService);
  private readonly objectStore = inject(ObjectStore);

  /** Each object's target, kept until the object or the table's grid changes. */
  private readonly made = new Map<string, { key: string; target: PickTarget }>();
  /** The pieces' targets, kept until the pieces or the camera change. */
  private pieceTargetsMade: {
    sprites: readonly TableWorldSprite[];
    coins: readonly TableWorldCoin[];
    camera: number;
    targets: readonly PickTarget[];
  } | null = null;

  /** The line of sight through a point of the page, or null before the table has a camera. */
  rayAt(pageX: number, pageY: number): TableRay | null {
    const inverse = this.camera.inverseSceneMatrix();
    return inverse ? tableRayOfPage(inverse, pageX, pageY, this.camera.eyeDepth()) : null;
  }

  /**
   * What a point of the page lands on first, a block, a piece or a look laid over the ground, or null
   * where it lands on nothing.
   */
  pickAt(pageX: number, pageY: number, accepts?: (target: PickTarget) => boolean): PickHit | null {
    const ray = this.rayAt(pageX, pageY);
    return ray ? pickFirst(this.everyTarget(), ray, accepts) : null;
  }

  /**
   * What a press at a point of the page is for: what it lands on first, but past the blocks locked in
   * place to a piece standing behind them on the same line of sight, as the page let a press on a
   * locked block pass through to what lay under it. A piece standing in a wood is pressed, not the
   * tree in front of it; a locked block with no piece behind it is pressed itself, for its menu. A
   * door and a switch are pressed themselves whatever stands behind them, as they are there to be.
   */
  pressedAt(pageX: number, pageY: number): PickHit | null {
    const hits = this.allAt(pageX, pageY);
    const first = hits[0];
    if (!first || !this.lockedBlock(first.target)) return first ?? null;
    for (const hit of hits) {
      if (this.lockedBlock(hit.target)) continue;
      return hit.target.layer === TERRAIN_PICK_LAYER || hit.target.layer === AMBIENCE_PICK_LAYER ? first : hit;
    }
    return first;
  }

  /** Whether a target is a block locked in place a press passes through: not a door, nor a switch. */
  private lockedBlock(target: PickTarget): boolean {
    if (target.layer !== TERRAIN_PICK_LAYER) return false;
    const block = this.objectStore.get(target.id);
    if (!(block instanceof Terrain) || !block.isLocked || block.doorStyle !== DoorStyle.NONE) return false;
    const held = block.boardSwitch;
    return !held || held.retired;
  }

  /**
   * Whether a point of a face, lifted some way off it, is hidden from the eye by the piece of that
   * identifier: by its picture, where it is solid, or its pedestal, standing between the point and
   * the eye, as the ring that turns a piece passes behind the piece's own picture.
   */
  hiddenBy(identifier: string, surface: string, x: number, y: number, height = 0): boolean {
    const point = this.surfaces.boardPointOf(surface, x, y, height);
    const page = this.surfaces.pageOf(surface, x, y, height);
    const ray = page ? this.rayAt(page.x, page.y) : null;
    if (!point || !ray) return false;
    const hit = pickFirst(
      this.pieceTargets().filter((target) => target.id === identifier),
      ray
    );
    if (!hit) return false;
    const along =
      (point.x - ray.origin.x) * ray.direction.x +
      (point.y - ray.origin.y) * ray.direction.y +
      (point.z - ray.origin.z) * ray.direction.z;
    return hit.t < along - HIDDEN_SLACK_PX;
  }

  /**
   * Where a corner of the picture of the piece of that identifier lies on the page, round from its
   * top left as the picture is read, or null where the piece has no picture drawn: the picture is the
   * quad of the piece standing tallest off the face, the top of its pedestal lying flat.
   */
  pictureCornerOnPage(identifier: string, corner: 0 | 1 | 2 | 3): { x: number; y: number } | null {
    const scene = this.camera.sceneMatrix();
    const target = this.pieceTargets().find((candidate) => candidate.id === identifier);
    const standing = (shape: PickShape) =>
      shape.kind === 'quad'
        ? Math.max(...shape.corners.map((at) => at.z)) - Math.min(...shape.corners.map((at) => at.z))
        : -1;
    const quad = target?.shapes.reduce<PickShape | null>(
      (tallest, shape) => (standing(shape) > (tallest ? standing(tallest) : 0) ? shape : tallest),
      null
    );
    if (!scene || !quad || quad.kind !== 'quad') return null;
    const point = quad.corners[corner];
    const page = pageOfTablePoint(scene, point.x, point.y, point.z);
    return { x: page.x, y: page.y };
  }

  /** Everything a point of the page lands on, blocks, pieces and looks laid over the ground, nearest the eye first. */
  allAt(pageX: number, pageY: number, accepts?: (target: PickTarget) => boolean): PickHit[] {
    const ray = this.rayAt(pageX, pageY);
    return ray ? pickAll(this.everyTarget(), ray, accepts) : [];
  }

  private everyTarget(): PickTarget[] {
    return [...this.targets(), ...this.pieceTargets(), ...this.ambienceTargets()];
  }

  /**
   * Where a point of the page lands on the table, in the board's space and never below the floor:
   * on the first thing the line of sight meets that a piece can be put on (a block, a wall drawn
   * with a picture, a white board or the floor), or on the floor's plane where it meets none of
   * them. Before the table has a camera, the point of the page is taken as the point of the floor.
   */
  landingAt(pageX: number, pageY: number): PointerCoordinate {
    const ray = this.rayAt(pageX, pageY);
    if (!ray) return { ...this.coordinates.floorPointOf(pageX, pageY), z: 0 };
    const hit = pickFirst([...this.faceTargets(), ...this.targets()], ray);
    if (hit) return { x: hit.point.x, y: hit.point.y, z: Math.max(0, hit.point.z) };
    const along = ray.direction.z !== 0 ? -ray.origin.z / ray.direction.z : 0;
    return { x: ray.origin.x + ray.direction.x * along, y: ray.origin.y + ray.direction.y * along, z: 0 };
  }

  /** Where the pointer lands on the table, as {@link landingAt} says. */
  landingAtPointer(): PointerCoordinate {
    const pointer = this.pointerDevice.pointers[0];
    return this.landingAt(pointer.x, pointer.y);
  }

  /**
   * The targets of the blocks standing on the table in view and not hidden from this seat, which
   * are what a piece may be put on and what stops the line of sight a piece is moved along.
   */
  targets(): PickTarget[] {
    return untracked(() => {
      const make = this.blockTargetMaker();
      const live = new Set<string>();
      const targets: PickTarget[] = [];
      for (const terrain of this.tabletop.terrains) {
        const target = make(terrain);
        if (!target) continue;
        live.add(terrain.identifier);
        targets.push(target);
      }
      for (const identifier of this.made.keys()) if (!live.has(identifier)) this.made.delete(identifier);
      return targets;
    });
  }

  /**
   * The targets of those of the blocks named that {@link targets} has, without making the rest: for
   * what goes with a few blocks, on a table of a great many.
   */
  targetsOf(identifiers: ReadonlySet<string>): PickTarget[] {
    return untracked(() => {
      const make = this.blockTargetMaker();
      const targets: PickTarget[] = [];
      for (const terrain of this.tabletop.terrains) {
        if (!identifiers.has(terrain.identifier)) continue;
        const target = make(terrain);
        if (target) targets.push(target);
      }
      return targets;
    });
  }

  /**
   * Makes the target of a block as the table stands now, or null for one not drawn for this seat:
   * made anew as the block changes, and as the table's grid, its size and its walls do, which say
   * where a block put on a wall stands.
   */
  private blockTargetMaker(): (terrain: Terrain) => PickTarget | null {
    const table = this.tabletop.currentTable;
    const ground = this.ground.surface();
    const grid = `${table.gridSize}|${table.gridType}`;
    const dims = {
      widthPx: table.width * table.gridSize,
      depthPx: table.height * table.gridSize,
      wallHeightPx: table.wallHeight * table.gridSize,
    };
    return (terrain) => {
      const onFloor = surfaceOf(terrain) === 'floor';
      if (onFloor && this.hiddenByFog(terrain)) return null;
      const board = boardSurfaceOf(terrain);
      const boardFrame = board ? this.surfaces.frameOf(board) : null;
      if (board && !boardFrame) return null;
      const boardVersion = board ? this.objectChange.versionOf(board)() : '';
      const lift = onFloor && !board ? groundLiftOfBlock(ground, table.gridSize, terrain) : 0;
      const size = `${table.width}|${table.height}|${table.wallHeight}`;
      return this.keep(terrain.identifier, `${grid}|${size}|${boardVersion}|${lift}`, () =>
        onFloor
          ? terrainPickTarget(terrain, table.gridSize, table.gridType, boardFrame ?? undefined, lift)
          : beamPickTarget(terrain, table.gridSize, dims)
      );
    };
  }

  /**
   * The targets of the pieces drawn on the table in view, as the canvas lays them out for this
   * seat: a piece drawn from sprites is made of a flat shape for each, a sprite turned to the eye
   * picked where it is turned to now, and a coin is a disc on the face it lies on. Of two pieces lying
   * flat the same distance off, as cards one on another, the one the canvas draws over the other is
   * in front.
   */
  pieceTargets(): readonly PickTarget[] {
    return untracked(() => {
      const sprites = this.pieces.sprites();
      const coins = this.pieces.coins();
      const camera = this.camera.version();
      const made = this.pieceTargetsMade;
      if (made && made.sprites === sprites && made.coins === coins && made.camera === camera) return made.targets;
      const view = this.camera.view;
      const layout = this.camera.layout;
      if (!view || !layout) return [];
      const eye = eyeAxesOf(tableEyeMatrix(view, layout));
      const byOwner = new Map<string, { kind: string; shapes: PickShape[]; masks: (AlphaMask | null)[] }>();
      for (const sprite of sprites) {
        const owner = byOwner.get(sprite.owner) ?? { kind: sprite.kind, shapes: [], masks: [] };
        owner.shapes.push({
          kind: 'quad',
          corners: sprite.seeThrough ? spriteCorners(sprite, eye) : spriteBoxCorners(sprite, eye),
        });
        owner.masks.push(
          sprite.seeThrough && sprite.look.kind === 'picture' ? this.pictures.maskOf(sprite.look.url) : null
        );
        byOwner.set(sprite.owner, owner);
      }
      for (const coin of coins) {
        const disc: PickCylinder = {
          kind: 'cylinder',
          centerX: coin.x,
          centerY: coin.y,
          radius: coin.radiusPx,
          base: coin.base,
          top: coin.base + coin.thicknessPx,
        };
        byOwner.set(coin.id, {
          kind: COIN_KIND,
          shapes: [{ kind: 'on-face', frame: coin.face, shape: disc }],
          masks: [null],
        });
      }
      const places = lyingPlaceOfOwners(sprites);
      const targets = [...byOwner].map(([id, owner]): PickTarget => {
        const masks = owner.masks;
        return {
          id,
          layer: owner.kind,
          order: (places.get(id) ?? -1) + 1,
          shapes: owner.shapes,
          ...(masks.some((mask) => mask !== null)
            ? { opaqueAt: (shape, u, v) => !masks[shape] || !seesThroughAt(masks[shape]!, { u, v }) }
            : {}),
        };
      });
      this.pieceTargetsMade = { sprites, coins, camera, targets };
      return targets;
    });
  }

  /** The looks laid over the ground this seat is shown, each by the part of the floor it covers. */
  ambienceTargets(): PickTarget[] {
    return untracked(() => {
      const gridSize = this.tabletop.currentTable.gridSize;
      return this.looks
        .shown()
        .map((look) =>
          ambiencePickTarget(
            look.identifier,
            look.location.x,
            look.location.y,
            Math.max(look.width, 1) * gridSize,
            Math.max(look.height, 1) * gridSize
          )
        );
    });
  }

  private keep(identifier: string, grid: string, make: () => PickTarget): PickTarget {
    const key = `${grid}|${this.objectChange.versionOf(identifier)()}`;
    const kept = this.made.get(identifier);
    if (kept?.key === key) return kept.target;
    const target = make();
    this.made.set(identifier, { key, target });
    return target;
  }

  /**
   * The face a point of the page lands on, the floor, a wall drawn with a picture or a white board,
   * or null where it lands on none. `stopsAt` says which other targets the line of sight stops at
   * before it, and one it stops at gives the face that target stands on. What is named in
   * `excluding`, and whatever stands on a face named there, is passed through.
   */
  faceAt(
    pageX: number,
    pageY: number,
    options: { readonly excluding?: ReadonlySet<string>; readonly stopsAt?: (target: PickTarget) => boolean } = {}
  ): string | null {
    const ray = this.rayAt(pageX, pageY);
    if (!ray) return null;
    const excluding = options.excluding ?? new Set<string>();
    const stopsAt = options.stopsAt ?? (() => false);
    const candidates = [...this.faceTargets(), ...this.targets().filter(stopsAt)].filter(
      (target) => !excluding.has(target.id) && !(target.surface !== undefined && excluding.has(target.surface))
    );
    return pickFirst(candidates, ray)?.target.surface ?? null;
  }

  /**
   * The faces things are put on: the floor, the walls drawn with a picture, and every white board. A
   * board laid flat lies over the floor, and of two laid in one place the later is drawn on top.
   */
  faceTargets(): PickTarget[] {
    return untracked(() => {
      const table = this.tabletop.currentTable;
      const faces: PickTarget[] = [];
      const face = (id: string, order = 0) => {
        const frame = this.surfaces.frameOf(id);
        const size = this.surfaces.sizeOf(id);
        if (frame && size) faces.push(faceTarget(id, frame, size.width, size.height, order));
      };
      face('floor');
      for (const wall of tableWallSettings(table)) {
        if (wall.shown && this.images.getEmptyOr(wall.imageIdentifier).url) face(wall.surface);
      }
      this.tabletop.whiteBoards.forEach((board, index) => face(board.identifier, index + 1));
      return faces;
    });
  }

  /** A block the fog lies over entirely is not drawn, so nothing lands on it. */
  private hiddenByFog(terrain: Terrain): boolean {
    const cover = this.vision.terrainFogCover(terrain);
    return cover !== null && !cover.cleared.some((cell) => cell);
  }
}
