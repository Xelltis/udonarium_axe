import { inject, Injectable } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { drawnScaleAt, pageOfTablePoint, tableRayOfPage } from '@axe/domain/tabletop/camera/table-camera';
import { SurfaceCrossing, surfaceCrossing, SurfaceFrame, surfaceFrame, Vec3 } from '@axe/domain/tabletop/surface-space';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { tableWallSettings } from '@axe/domain/tabletop/table-walls';
import { TABLE_SURFACES, TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { whiteBoardFrame } from '@axe/domain/tabletop/white-board-frame';

/**
 * Carries points between the page and the faces things are put on, worked out from the table's
 * camera: the floor, the walls of the table in view, and every white board, each named as an
 * object's location names it.
 */
@Injectable({
  providedIn: 'root',
})
export class TableSurfaceService {
  // The table in view is read off the selecter rather than through TabletopService, which reads
  // points through the coordinate service that reads them through this one. Where nothing provides
  // the selecter or the store, no face is known and points are read back from the page's styles
  // instead.
  private readonly tableSelecter = inject(TableSelecter, { optional: true });
  private readonly camera = inject(TableCameraService);
  private readonly objectStore = inject(ObjectStore, { optional: true });
  private readonly transient = inject(TransientPlacementService);

  /**
   * The face a surface name stands for, or null for a name that is neither a face of the table nor a
   * board. A board this seat is moving is where it is being moved to, as it is drawn.
   */
  frameOf(surface: string): SurfaceFrame | null {
    const table = this.tableSelecter?.viewTable;
    if (!table) return null;
    if ((TABLE_SURFACES as readonly string[]).includes(surface)) {
      return surfaceFrame(surface as TableSurface, {
        widthPx: table.width * table.gridSize,
        depthPx: table.height * table.gridSize,
        wallHeightPx: table.wallHeight * table.gridSize,
      });
    }
    const board = this.objectStore?.get(surface);
    if (!(board instanceof WhiteBoard)) return null;
    const moving = this.transient.placementOf(board.identifier);
    if (!moving) return whiteBoardFrame(board, table.gridSize);
    const { width, height, pitch, rotate } = board;
    return whiteBoardFrame({ width, height, pitch, rotate, location: moving, posZ: moving.z }, table.gridSize);
  }

  /** How far a face runs across and down, in pixels, or null for a face it does not know. */
  sizeOf(surface: string): { width: number; height: number } | null {
    const table = this.tableSelecter?.viewTable;
    if (!table) return null;
    if (surface === 'floor') return { width: table.width * table.gridSize, height: table.height * table.gridSize };
    const wall = tableWallSettings(table).find((setting) => setting.surface === surface);
    if (wall) return { width: wall.lengthPx, height: wall.heightPx };
    const board = this.objectStore?.get(surface);
    return board instanceof WhiteBoard
      ? { width: board.width * table.gridSize, height: board.height * table.gridSize }
      : null;
  }

  /** Whether a piece may hang over the edge of a face: of a white board it may, of the table's own faces not. */
  overhangs(surface: string): boolean {
    return !(TABLE_SURFACES as readonly string[]).includes(surface);
  }

  /**
   * Where a point of the page lands on a face, in the face's own axes, or null before the table has
   * a camera or for a face the line of sight runs along.
   */
  pointOn(surface: string, pageX: number, pageY: number): SurfaceCrossing | null {
    const inverse = this.camera.inverseSceneMatrix();
    const frame = this.frameOf(surface);
    if (!inverse || !frame) return null;
    const ray = tableRayOfPage(inverse, pageX, pageY);
    return surfaceCrossing(frame, ray.origin, ray.direction);
  }

  /** Where a point of a face, lifted some way off it, is drawn on the page, or null before the table has a camera. */
  pageOf(surface: string, localX: number, localY: number, height = 0): { x: number; y: number } | null {
    const scene = this.camera.sceneMatrix();
    const point = this.boardPointOf(surface, localX, localY, height);
    if (!scene || !point) return null;
    const onPage = pageOfTablePoint(scene, point.x, point.y, point.z);
    return { x: onPage.x, y: onPage.y };
  }

  /**
   * How large a thing at a point of a face is drawn, against how large it would be drawn at the depth
   * of the page itself, or null before the table has a camera.
   */
  drawnScaleOn(surface: string, localX: number, localY: number, height = 0): number | null {
    const scene = this.camera.sceneMatrix();
    const point = this.boardPointOf(surface, localX, localY, height);
    return scene && point ? drawnScaleAt(scene, point.x, point.y, point.z) : null;
  }

  /** Where a point of a face, lifted some way off it, stands in the board's space, or null for a face it does not know. */
  boardPointOf(surface: string, localX: number, localY: number, height = 0): Vec3 | null {
    const frame = this.frameOf(surface);
    if (!frame) return null;
    return {
      x: frame.origin.x + frame.u.x * localX + frame.v.x * localY + frame.normal.x * height,
      y: frame.origin.y + frame.u.y * localX + frame.v.y * localY + frame.normal.y * height,
      z: frame.origin.z + frame.u.z * localX + frame.v.z * localY + frame.normal.z * height,
    };
  }
}
