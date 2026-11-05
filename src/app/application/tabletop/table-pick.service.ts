import { inject, Injectable, untracked } from '@angular/core';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { TableAmbienceService } from '@axe/application/tabletop/table-ambience.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { tableEyeMatrix, TableRay, tableRayOfPage } from '@axe/domain/tabletop/camera/table-camera';
import { groundLiftOfBlock } from '@axe/domain/tabletop/ground/ground-surface';
import { ambiencePickTarget } from '@axe/domain/tabletop/pick/ambience-pick';
import { faceTarget } from '@axe/domain/tabletop/pick/face-pick';
import { PickCylinder, PickShape } from '@axe/domain/tabletop/pick/pick-geometry';
import { pickAll, pickFirst, PickHit, PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { beamPickTarget, terrainPickTarget } from '@axe/domain/tabletop/pick/terrain-pick';
import { tableWallSettings } from '@axe/domain/tabletop/table-walls';
import { boardSurfaceOf, surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
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
@Injectable({
  providedIn: 'root',
})
export class TablePickService {
  private readonly ground = inject(GroundService);
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
    return inverse ? tableRayOfPage(inverse, pageX, pageY) : null;
  }

  /**
   * What a point of the page lands on first, a block, a piece or a look laid over the ground, or null
   * where it lands on nothing.
   */
  pickAt(pageX: number, pageY: number, accepts?: (target: PickTarget) => boolean): PickHit | null {
    const ray = this.rayAt(pageX, pageY);
    return ray ? pickFirst(this.everyTarget(), ray, accepts) : null;
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
   * them. Before the table has a camera it is read off the element at the point, as the table drawn
   * in the page always did.
   */
  landingAt(pageX: number, pageY: number): PointerCoordinate {
    const ray = this.rayAt(pageX, pageY);
    if (!ray) {
      const under = document.elementFromPoint(pageX, pageY);
      return this.coordinates.calcTabletopLocalCoordinate(
        { x: pageX, y: pageY, z: 0 },
        under instanceof HTMLElement ? under : undefined
      );
    }
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
      const table = this.tabletop.currentTable;
      const ground = this.ground.surface();
      const grid = `${table.gridSize}|${table.gridType}`;
      const live = new Set<string>();
      const targets: PickTarget[] = [];
      const dims = {
        widthPx: table.width * table.gridSize,
        depthPx: table.height * table.gridSize,
        wallHeightPx: table.wallHeight * table.gridSize,
      };
      for (const terrain of this.tabletop.terrains) {
        const onFloor = surfaceOf(terrain) === 'floor';
        if (onFloor && this.hiddenByFog(terrain)) continue;
        const board = boardSurfaceOf(terrain);
        const boardFrame = board ? this.surfaces.frameOf(board) : null;
        if (board && !boardFrame) continue;
        live.add(terrain.identifier);
        const boardVersion = board ? this.objectChange.versionOf(board)() : '';
        const lift = onFloor && !board ? groundLiftOfBlock(ground, table.gridSize, terrain) : 0;
        targets.push(
          this.keep(terrain.identifier, `${grid}|${table.wallHeight}|${boardVersion}|${lift}`, () =>
            onFloor
              ? terrainPickTarget(terrain, table.gridSize, table.gridType, boardFrame ?? undefined, lift)
              : beamPickTarget(terrain, table.gridSize, dims)
          )
        );
      }
      for (const identifier of this.made.keys()) if (!live.has(identifier)) this.made.delete(identifier);
      return targets;
    });
  }

  /**
   * The targets of the pieces drawn on the table in view, as the canvas lays them out for this
   * seat: a piece drawn from sprites is made of a flat shape for each, a sprite turned to the eye
   * picked where it is turned to now, and a coin is a disc on the face it lies on.
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
      const targets = [...byOwner].map(([id, owner]): PickTarget => {
        const masks = owner.masks;
        return {
          id,
          layer: owner.kind,
          order: 0,
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
