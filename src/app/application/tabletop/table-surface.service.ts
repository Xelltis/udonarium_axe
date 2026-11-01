import { inject, Injectable } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { pageOfTablePoint, tableRayOfPage } from '@axe/domain/tabletop/camera/table-camera';
import { SurfaceCrossing, surfaceCrossing, SurfaceFrame, surfaceFrame } from '@axe/domain/tabletop/surface-space';
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

  /** The face a surface name stands for, or null for a name that is neither a face of the table nor a board. */
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
    return board instanceof WhiteBoard ? whiteBoardFrame(board, table.gridSize) : null;
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
    const frame = this.frameOf(surface);
    if (!scene || !frame) return null;
    const x = frame.origin.x + frame.u.x * localX + frame.v.x * localY + frame.normal.x * height;
    const y = frame.origin.y + frame.u.y * localX + frame.v.y * localY + frame.normal.y * height;
    const z = frame.origin.z + frame.u.z * localX + frame.v.z * localY + frame.normal.z * height;
    const onPage = pageOfTablePoint(scene, x, y, z);
    return { x: onPage.x, y: onPage.y };
  }
}
