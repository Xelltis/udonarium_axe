import { inject, Injectable, signal } from '@angular/core';
import { PointerCoordinate, PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { Transform } from '@axe/core/transform/transform';
import { pageOfTablePoint, tablePointOfPage } from '@axe/domain/tabletop/camera/table-camera';

@Injectable({
  providedIn: 'root',
})
export class CoordinateService {
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly tableCamera = inject(TableCameraService);
  private readonly tableSurfaces = inject(TableSurfaceService);

  tabletopOriginElement: HTMLElement = document.body;

  // A new transform per pointer move costs three matrices and a walk of the computed styles, and the garbage adds up.
  // Two instances live on the service and are pointed at whatever is needed.
  private readonly _transformA: Transform = new Transform(document.body);
  private readonly _transformB: Transform = new Transform(document.body);

  /**
   * The table's own transform, worked out once for the frame it is asked in.
   *
   * Every point converted while something is dragged walks the table's ancestors and reads
   * each one's computed style, and a drag asks several times per report. What that walk finds
   * only changes when the view moves, which happens once a frame at most, so the answer is
   * kept until the frame ends or the view is written out again.
   */
  private readonly _transformOrigin: Transform = new Transform(document.body);
  private originElement: HTMLElement | null = null;
  private frameArmed = false;

  private readonly transformVersion = signal(0);

  /**
   * Goes up each time the view is written out.
   *
   * What is projected from the table onto the screen only moves when this does, or when the
   * page moves under a table that stands still.
   */
  readonly tabletopTransformVersion = this.transformVersion.asReadonly();

  /** Called when the view has been written out, since that is what the kept answer was about. */
  invalidateTabletopTransform(): void {
    this.originElement = null;
    this.transformVersion.update((version) => version + 1);
  }

  private originTransform(element: HTMLElement): Transform | null {
    if (element !== this.tabletopOriginElement) return null;
    if (this.originElement === element && element.isConnected) return this._transformOrigin;

    this.originElement = element;
    this._transformOrigin.reinit(element);
    this.dropAfterFrame();
    return this._transformOrigin;
  }

  private dropAfterFrame(): void {
    if (this.frameArmed || typeof requestAnimationFrame !== 'function') return;
    this.frameArmed = true;
    requestAnimationFrame(() => {
      this.frameArmed = false;
      this.originElement = null;
    });
  }

  /**
   * Whether points on this element are worked out from the table's camera rather than read back
   * from the page's styles as the board's own floor, once the table has drawn a view and been laid
   * out. The walls and the boards are worked out from their own faces; anything standing on the
   * board still walks the styles above it.
   */
  private cameraOver(element: HTMLElement): boolean {
    return element === this.tabletopOriginElement;
  }

  /**
   * The face of the table or the board an element is the face of, by its `data-surface`, for the
   * walls and the white boards. A point on one is worked out from that face's frame; its height is
   * taken along the face's normal, out into the room.
   */
  private faceOf(element: HTMLElement): string | null {
    const face = typeof element.getAttribute === 'function' ? element.getAttribute('data-surface') : null;
    return face && face !== 'floor' ? face : null;
  }

  /** The kept table transform where it fits, and a pooled one otherwise; only the pooled one is given back. */
  private borrow(element: HTMLElement, pool: Transform): { transform: Transform; pooled: boolean } {
    const kept = this.originTransform(element);
    return kept ? { transform: kept, pooled: false } : { transform: pool.reinit(element), pooled: true };
  }

  private giveBack(borrowed: { transform: Transform; pooled: boolean }): void {
    if (borrowed.pooled) borrowed.transform.clear();
  }

  /**
   * The matrix that takes a point of the table onto the page, through every transform and
   * perspective above it, as it stands this frame; a point's place is its x and y over its w.
   */
  tabletopSceneMatrix(out: Matrix3D = new Matrix3D()): Matrix3D {
    const scene = this.tableCamera.sceneMatrix();
    if (scene) return out.identity().append(scene);
    const borrowed = this.borrow(this.tabletopOriginElement, this._transformA);
    borrowed.transform.sceneMatrix(out);
    this.giveBack(borrowed);
    return out;
  }

  /**
   * Converts a point on the page onto a face, named as a location names it (the floor, a wall or a
   * white board), in the face's own axes. Worked out from the table's camera once it has drawn a
   * view, and read back from the element the face is drawn with until then.
   */
  convertToFace(pointer: PointerCoordinate, surface: string): PointerCoordinate {
    const onFace = this.tableSurfaces.pointOn(surface, pointer.x, pointer.y);
    if (onFace) return { x: onFace.localX, y: onFace.localY, z: 0 };
    return this.convertToLocal(pointer, this.faceElement(surface) ?? this.tabletopOriginElement);
  }

  /** Converts a point of a face, lifted `z` off it, onto the page: the way back from {@link convertToFace}. */
  convertFromFace(pointer: PointerCoordinate, surface: string): PointerCoordinate {
    const onPage = this.tableSurfaces.pageOf(surface, pointer.x, pointer.y, pointer.z ?? 0);
    if (onPage) return { x: onPage.x, y: onPage.y, z: pointer.z ?? 0 };
    return this.convertToGlobal(pointer, this.faceElement(surface) ?? this.tabletopOriginElement);
  }

  /**
   * How large a thing at a point of a face is drawn, against how large it would be drawn at the depth
   * of the page itself, or null before the table has a camera.
   */
  drawnScaleOnFace(pointer: PointerCoordinate, surface: string): number | null {
    return this.tableSurfaces.drawnScaleOn(surface, pointer.x, pointer.y, pointer.z ?? 0);
  }

  /** The element a face is drawn with while the table is drawn in the page, or null where there is none. */
  faceElement(surface: string): HTMLElement | null {
    if (surface === 'floor') return this.tabletopOriginElement;
    return document.querySelector<HTMLElement>(`[data-surface="${CSS.escape(surface)}"]`);
  }

  /** Converts a point on the page into the element's own space, through every transform above it. */
  convertToLocal(pointer: PointerCoordinate, element: HTMLElement = document.body): PointerCoordinate {
    const inverse = this.cameraOver(element) && this.tableCamera.inverseSceneMatrix();
    if (inverse) {
      const onBoard = tablePointOfPage(inverse, pointer.x, pointer.y);
      return { x: onBoard.x, y: onBoard.y, z: onBoard.z };
    }
    const face = this.faceOf(element);
    const onFace = face && this.tableSurfaces.pointOn(face, pointer.x, pointer.y);
    if (onFace) return { x: onFace.localX, y: onFace.localY, z: 0 };
    const borrowed = this.borrow(element, this._transformA);
    const ray = borrowed.transform.globalToLocal(pointer.x, pointer.y, pointer.z ?? 0);
    this.giveBack(borrowed);
    return { x: ray.x, y: ray.y, z: ray.z };
  }

  /** Converts a point in the element's own space back onto the page. */
  convertToGlobal(pointer: PointerCoordinate, element: HTMLElement = document.body): PointerCoordinate {
    const scene = this.cameraOver(element) && this.tableCamera.sceneMatrix();
    if (scene) {
      const onPage = pageOfTablePoint(scene, pointer.x, pointer.y, pointer.z ?? 0);
      return { x: onPage.x, y: onPage.y, z: onPage.z };
    }
    const face = this.faceOf(element);
    const onPage = face && this.tableSurfaces.pageOf(face, pointer.x, pointer.y, pointer.z ?? 0);
    if (onPage) return { x: onPage.x, y: onPage.y, z: pointer.z ?? 0 };
    const borrowed = this.borrow(element, this._transformA);
    const ray = borrowed.transform.localToGlobal(pointer.x, pointer.y, pointer.z ?? 0);
    this.giveBack(borrowed);
    return { x: ray.x, y: ray.y, z: ray.z };
  }

  /** Projects several points on one element at once; one call per point would rebuild the ancestor matrices each time. */
  convertManyToGlobal(
    pointers: readonly PointerCoordinate[],
    element: HTMLElement = document.body
  ): PointerCoordinate[] {
    const scene = this.cameraOver(element) && this.tableCamera.sceneMatrix();
    if (scene) {
      return pointers.map((pointer) => {
        const onPage = pageOfTablePoint(scene, pointer.x, pointer.y, pointer.z ?? 0);
        return { x: onPage.x, y: onPage.y, z: onPage.z };
      });
    }
    const face = this.faceOf(element);
    if (face && this.tableSurfaces.frameOf(face) && this.tableCamera.sceneMatrix()) {
      return pointers.map((pointer) => {
        const onPage = this.tableSurfaces.pageOf(face, pointer.x, pointer.y, pointer.z ?? 0)!;
        return { x: onPage.x, y: onPage.y, z: pointer.z ?? 0 };
      });
    }
    const borrowed = this.borrow(element, this._transformA);
    const result = pointers.map((pointer) => {
      const ray = borrowed.transform.localToGlobal(pointer.x, pointer.y, pointer.z ?? 0);
      return { x: ray.x, y: ray.y, z: ray.z };
    });
    this.giveBack(borrowed);
    return result;
  }

  /**
   * Converts a page point as it lands on `from` into `to`'s space.
   *
   * The point is taken to lie on `from`'s own plane, which is how a drop onto a raised or tilted
   * object finds where it falls on the table.
   */
  convertLocalToLocal(pointer: PointerCoordinate, from: HTMLElement, to: HTMLElement): PointerCoordinate {
    const fromBorrowed = this.borrow(from, this._transformA);
    const local = fromBorrowed.transform.globalToLocal(pointer.x, pointer.y, pointer.z ?? 0);
    const toBorrowed = this.borrow(to, this._transformB);
    const ray = fromBorrowed.transform.localToLocalUsing(local.x, local.y, 0, toBorrowed.transform);
    this.giveBack(fromBorrowed);
    this.giveBack(toBorrowed);
    return { x: ray.x, y: ray.y, z: ray.z };
  }

  /**
   * Where a pointer lands on the table, by default the current pointer over the element under it.
   *
   * A target that contains the table is read straight through to the table's floor. Any other
   * target is read on its own plane, so dropping onto a piece lands at its height. The height never
   * comes back below zero.
   */
  calcTabletopLocalCoordinate(
    coordinate: PointerCoordinate = {
      x: this.pointerDeviceService.pointers[0].x,
      y: this.pointerDeviceService.pointers[0].y,
      z: 0,
    },
    target: HTMLElement = this.pointerDeviceService.targetElement
  ): PointerCoordinate {
    const local = target.contains(this.tabletopOriginElement)
      ? { ...this.convertToLocal(coordinate, this.tabletopOriginElement), z: 0 }
      : this.convertLocalToLocal(coordinate, target, this.tabletopOriginElement);
    return { x: local.x, y: local.y, z: Math.max(0, local.z) };
  }
}
