import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface MovableCoordinateResolver {
  convertToLocal(pointer: PointerCoordinate, element: HTMLElement): PointerCoordinate;
}

export type MovableLayerItem = {
  layerName: string;
  input?: { isGrabbing: boolean } | null;
  setPointerEvents(isEnable: boolean): void;
};

/** The CSS transform that places a piece at a position on its surface, followed by its own offset. */
export function toTransformCss(posX: number, posY: number, posZ: number, transformCssOffset: string): string {
  return 'translate3d(' + posX + 'px,' + posY + 'px,' + posZ + 'px) ' + transformCssOffset;
}

/**
 * Whether a piece's synced position differs from the one it is shown at.
 *
 * False for a missing object or one without a location, so there is nothing to animate.
 */
export function shouldTransitionTo(
  object: TabletopObject | null | undefined,
  posX: number,
  posY: number,
  posZ: number
): boolean {
  if (!object?.location) return false;
  return object.location.x !== posX || object.location.y !== posY || object.posZ !== posZ;
}

/**
 * Turns a screen point into a point on the piece's surface, at the height it would rest at there.
 *
 * The height is never below the surface itself.
 */
export function resolveMovableLocalCoordinate(
  coordinateService: MovableCoordinateResolver,
  surfaceElement: HTMLElement,
  pointer2d: PointerCoordinate,
  contactSupportZ: (centerX: number, centerY: number) => number
): PointerCoordinate {
  const local = coordinateService.convertToLocal(pointer2d, surfaceElement);
  return { x: local.x, y: local.y, z: Math.max(0, contactSupportZ(local.x, local.y)) };
}

/**
 * The elements of a piece that the pointer can hit.
 *
 * The root itself when it takes pointer events; otherwise the shallowest descendants that do,
 * so a piece drawn only in nested parts can still be switched on and off as a whole.
 */
export function collectCollidableElements(root: HTMLElement): HTMLElement[] {
  if (resolvePointerEvents(root) !== 'none') {
    return [root];
  }

  const collidableElements: HTMLElement[] = [];
  findNestedCollidableElements(root, collidableElements);
  return collidableElements;
}

function findNestedCollidableElements(element: HTMLElement, collidableElements: HTMLElement[]) {
  const children = element.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!(child instanceof HTMLElement)) continue;
    if (resolvePointerEvents(child) !== 'none') {
      collidableElements.push(child);
    }
  }

  if (collidableElements.length > 0) return;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!(child instanceof HTMLElement)) continue;
    findNestedCollidableElements(child, collidableElements);
  }
}

function resolvePointerEvents(element: HTMLElement): string {
  return element.style.pointerEvents || getComputedStyle(element).pointerEvents;
}

/** Lets the pointer hit the given elements, or passes it straight through them. */
export function applyPointerEvents(elements: HTMLElement[], isEnable: boolean) {
  const css = isEnable ? 'auto' : 'none';
  elements.forEach((element) => (element.style.pointerEvents = css));
}

/**
 * Decides which other pieces the pointer may land on while one piece is picked up or put down.
 *
 * While a piece is held, the layers it collides with stay hittable and every other layer is
 * passed through, as is the rest of its own layer; once it is let go everything is hittable
 * again. The piece itself and any piece still held by someone's pointer are left alone.
 */
export function setLayerCollidable(
  layerHash: { [layerName: string]: MovableLayerItem[] },
  colideLayers: string[],
  self: MovableLayerItem,
  selfIsGrabbing: boolean,
  isCollidable: boolean
) {
  for (const layerName of Object.keys(layerHash)) {
    let isEnable: boolean;
    if (selfIsGrabbing && layerName === self.layerName) {
      // While dragging, force same-layer siblings to pointer-events:none.
      // Self-colliding layers (e.g. terrain colides with 'terrain') would otherwise leave
      // peers interactive — and when the cursor crosses one of them mid-drag the browser
      // can fire synthetic pointer-events-toggle mousemoves with `buttons === 0`, which
      // PointerDeviceService treats as drag-end, cancelling the drag.
      isEnable = false;
    } else if (-1 < colideLayers.indexOf(layerName)) {
      isEnable = selfIsGrabbing ? isCollidable : true;
    } else {
      isEnable = !isCollidable;
    }

    layerHash[layerName].forEach((movable) => {
      if (movable === self || movable.input?.isGrabbing) return;
      movable.setPointerEvents(isEnable);
    });
  }
}

/** Adds a piece to the named layer in the registry, once. */
export function registerLayer(
  layerHash: { [layerName: string]: MovableLayerItem[] },
  layerName: string,
  self: MovableLayerItem
) {
  if (!(layerName in layerHash)) layerHash[layerName] = [];
  const index = layerHash[layerName].indexOf(self);
  if (index < 0) layerHash[layerName].push(self);
}

/** Takes a piece out of the named layer in the registry; does nothing when it is not there. */
export function unregisterLayer(
  layerHash: { [layerName: string]: MovableLayerItem[] },
  layerName: string,
  self: MovableLayerItem
) {
  if (!(layerName in layerHash)) return;
  const index = layerHash[layerName].indexOf(self);
  if (-1 < index) layerHash[layerName].splice(index, 1);
}

/**
 * The face under the pointer that a piece could be put down on, or nothing.
 *
 * A board carries a face of its own, and while it is being dragged that face travels under
 * the pointer with it. Taken at its word the board is laid on itself, and it lands wherever
 * its own corner happens to be, so the board would leap about the table.
 */
export function dropTargetSurface(dragged: Element, under: Element | null): HTMLElement | null {
  const surface = under?.closest<HTMLElement>('[data-surface]') ?? null;
  if (!surface || dragged.contains(surface)) return null;
  return surface;
}

/**
 * Which way a turn of the wheel went, whichever axis the browser reported it on.
 *
 * Held with shift a wheel is taken for a sideways scroll, so the turn arrives on deltaX with
 * deltaY flat. Reading whichever axis moved keeps one gesture out of two spellings.
 */
export function wheelSpin(e: WheelEvent): number {
  return e.deltaY !== 0 ? e.deltaY : e.deltaX;
}
