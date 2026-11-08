import { inject, Injectable } from '@angular/core';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { pageOfTablePoint, tablePointOfPage } from '@axe/domain/tabletop/camera/table-camera';

/**
 * Takes points between the page and the faces of the table, worked out from the table's camera.
 * Before the table has a camera, a point of the page is taken as the same point of the face.
 */
@Injectable({
  providedIn: 'root',
})
export class CoordinateService {
  private readonly tableCamera = inject(TableCameraService);
  private readonly tableSurfaces = inject(TableSurfaceService);

  /**
   * Converts a point on the page onto a face, named as a location names it (the floor, a wall or a
   * white board), in the face's own axes.
   */
  convertToFace(pointer: PointerCoordinate, surface: string): PointerCoordinate {
    const onFace = this.tableSurfaces.pointOn(surface, pointer.x, pointer.y);
    if (onFace) return { x: onFace.localX, y: onFace.localY, z: 0 };
    return { x: pointer.x, y: pointer.y, z: 0 };
  }

  /** Converts a point of a face, lifted `z` off it, onto the page: the way back from {@link convertToFace}. */
  convertFromFace(pointer: PointerCoordinate, surface: string): PointerCoordinate {
    const onPage = this.tableSurfaces.pageOf(surface, pointer.x, pointer.y, pointer.z ?? 0);
    if (onPage) return { x: onPage.x, y: onPage.y, z: pointer.z ?? 0 };
    return { x: pointer.x, y: pointer.y, z: pointer.z ?? 0 };
  }

  /**
   * How large a thing at a point of a face is drawn, against how large it would be drawn at the depth
   * of the page itself, or null before the table has a camera.
   */
  drawnScaleOnFace(pointer: PointerCoordinate, surface: string): number | null {
    return this.tableSurfaces.drawnScaleOn(surface, pointer.x, pointer.y, pointer.z ?? 0);
  }

  /** The point of the board's floor a point of the page lies over. */
  floorPointOf(pageX: number, pageY: number): PointerCoordinate {
    const inverse = this.tableCamera.inverseSceneMatrix();
    if (!inverse) return { x: pageX, y: pageY, z: 0 };
    const onBoard = tablePointOfPage(inverse, pageX, pageY);
    return { x: onBoard.x, y: onBoard.y, z: onBoard.z };
  }

  /** Where a point of the board, lifted `z` off the floor, shows on the page. */
  pageOfFloorPoint(x: number, y: number, z = 0): PointerCoordinate {
    const scene = this.tableCamera.sceneMatrix();
    if (!scene) return { x, y, z };
    const onPage = pageOfTablePoint(scene, x, y, z);
    return { x: onPage.x, y: onPage.y, z: onPage.z };
  }
}
