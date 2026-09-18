import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCornerOffsets,
  hexLayoutOf,
  hexSpacing,
  hexStartAngle,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';
import { WorldBox } from '@axe/domain/tabletop/surface-space';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface MovableCoordinateResolver {
  convertToLocal(pointer: PointerCoordinate, element: HTMLElement): PointerCoordinate;
}

export interface ContactFootprint {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bottomZ: number;
  topZ: number;
  /** Whether a piece may come to rest on top of this. A sheer face may be stood beside, not on. */
  climbable?: boolean;
  /**
   * How high the top stands over one point, for something whose top is not level.
   *
   * A sloping block answers with the height of its surface there, so a piece dragged across it
   * follows the slope instead of riding along at the height of its highest corner.
   */
  topAt?: (x: number, y: number) => number;
  /** What this footprint belongs to, so a piece can keep to the surface it is already on. */
  identifier?: string;
}

export interface ContactRider {
  altitudePx: number;
  thicknessPx: number;
  ridesUp: boolean;
  restingZ: number;
  /** What the piece is resting on, whose surface it keeps to while that surface is under it. */
  restingOn?: string;
}

/** Where a dragged piece rests, and what it is resting on. */
export interface ContactSupport {
  z: number;
  on?: string;
}

const CONTACT_EPSILON_PX = 0.5;
const CONTACT_MIN_THICKNESS_PX = 1;

const FLAT_ON_THE_FLOOR: ContactRider = { altitudePx: 0, thicknessPx: 0, ridesUp: true, restingZ: 0 };

/**
 * Every height a piece centred at the given point could come to rest at, lowest first.
 *
 * The floor counts, as does the top of each climbable footprint under the centre. A level is
 * left out when the piece, at its own thickness, would push into something hanging above it.
 */
export function contactRestLevels(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number,
  rider: ContactRider = FLAT_ON_THE_FLOOR
): number[] {
  const under = footprintsUnder(footprints, centerX, centerY);
  const levels = new Set<number>();
  for (const level of contactLevels(under)) {
    if (riderFits(under, rider, level)) levels.add(level);
  }
  return [...levels].sort((a, b) => a - b);
}

/**
 * The rest level just above or just below `from`, for stepping a held piece up or down.
 *
 * Levels within half a pixel of `from` do not count as a step. Null when there is nothing
 * further in that direction.
 */
export function nextContactLevel(levels: readonly number[], from: number, isUp: boolean): number | null {
  if (isUp) {
    for (const level of levels) {
      if (level > from + CONTACT_EPSILON_PX) return level;
    }
    return null;
  }
  for (let i = levels.length - 1; i >= 0; i--) {
    if (levels[i] < from - CONTACT_EPSILON_PX) return levels[i];
  }
  return null;
}

/**
 * The height a piece dragged to the given point stands on.
 *
 * The piece takes the level nearest the height it is already at, so a low step is risen onto
 * while the ground stays the ground beside a wall, and one dragged off a block drops to what
 * is under it. Two levels equally near leave it on the lower one. With nothing under its
 * centre it takes the floor, and failing that the highest climbable top there.
 */
export function findContactSupportZ(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number,
  rider: ContactRider = FLAT_ON_THE_FLOOR
): number {
  return findContactSupport(footprints, centerX, centerY, rider).z;
}

/**
 * The same, together with what the piece came to rest on.
 *
 * A piece already resting on something keeps to that thing's surface while it is still under
 * it, rising as well as falling, so one dragged along a ramp walks up and down the ramp rather
 * than stepping off it into the air or onto the floor.
 */
export function findContactSupport(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number,
  rider: ContactRider = FLAT_ON_THE_FLOOR
): ContactSupport {
  const under = footprintsUnder(footprints, centerX, centerY);
  const stayingOn = under.find(
    (footprint) =>
      footprint.climbable !== false &&
      rider.restingOn !== undefined &&
      footprint.identifier === rider.restingOn &&
      riderFits(under, rider, footprint.topZ)
  );
  if (stayingOn) return { z: stayingOn.topZ, on: stayingOn.identifier };

  const levels = contactRestLevels(footprints, centerX, centerY, rider);
  const standingAt = contactBottomAt(rider, rider.restingZ);
  // A piece held above the ground reads that height as clearance rather than as a step it has
  // taken, so what it flies over is not something to come to rest on top of.
  const keepsClearance = rider.altitudePx > CONTACT_EPSILON_PX;
  let nearest: number | null = null;
  for (const level of levels) {
    if (keepsClearance && level > standingAt + CONTACT_EPSILON_PX) continue;
    // Levels come lowest first, so only a level nearer by more than a rounding takes over,
    // which leaves the lower of two equally near ones.
    if (nearest === null || Math.abs(level - standingAt) < Math.abs(nearest - standingAt) - CONTACT_EPSILON_PX) {
      nearest = level;
    }
  }
  if (nearest !== null) return { z: nearest, on: restingOnAt(under, nearest) };

  let highest = 0;
  for (const footprint of under) {
    if (footprint.climbable === false) continue;
    if (footprint.topZ > highest) highest = footprint.topZ;
  }
  return { z: highest, on: restingOnAt(under, highest) };
}

/** What holds a piece up at this height, of the things under it. */
function restingOnAt(under: readonly ContactFootprint[], level: number): string | undefined {
  for (const footprint of under) {
    if (footprint.climbable === false) continue;
    if (Math.abs(footprint.topZ - level) <= CONTACT_EPSILON_PX) return footprint.identifier;
  }
  return undefined;
}

function footprintsUnder(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number
): ContactFootprint[] {
  const under: ContactFootprint[] = [];
  for (const footprint of footprints) {
    if (centerX < footprint.left || centerX > footprint.right) continue;
    if (centerY < footprint.top || centerY > footprint.bottom) continue;
    under.push(footprint.topAt ? { ...footprint, topZ: footprint.topAt(centerX, centerY) } : footprint);
  }
  return under;
}

function contactLevels(under: readonly ContactFootprint[]): number[] {
  const levels = [0];
  for (const footprint of under) {
    if (footprint.climbable === false) continue;
    if (footprint.topZ > 0) levels.push(footprint.topZ);
  }
  return levels;
}

/**
 * Where the underside of a piece sits when it rests on `level`.
 *
 * A piece that rides up carries its altitude on top of what it stands on; one that does not,
 * such as terrain, keeps its own altitude unless the level is already higher.
 */
export function contactBottomAt(rider: Pick<ContactRider, 'altitudePx' | 'ridesUp'>, level: number): number {
  return rider.ridesUp ? level + rider.altitudePx : Math.max(rider.altitudePx, level);
}

function riderFits(under: readonly ContactFootprint[], rider: ContactRider, level: number): boolean {
  const bottom = contactBottomAt(rider, level);
  const top = bottom + Math.max(rider.thicknessPx, CONTACT_MIN_THICKNESS_PX);
  for (const footprint of under) {
    if (bottom >= footprint.topZ - CONTACT_EPSILON_PX) continue;
    if (top > footprint.bottomZ + CONTACT_EPSILON_PX) return false;
  }
  return true;
}

/**
 * The top-left corner and height at which a piece of the given size sits on top of a beam.
 *
 * The piece's centre is pulled inside the beam's footprint and it is laid on the beam's top.
 */
export function beamRestPosition(
  box: WorldBox,
  worldX: number,
  worldY: number,
  width: number,
  height: number
): { x: number; y: number; z: number } {
  const centerX = Math.min(box.maxX, Math.max(box.minX, worldX));
  const centerY = Math.min(box.maxY, Math.max(box.minY, worldY));
  return { x: Math.floor(centerX - width / 2), y: Math.floor(centerY - height / 2), z: box.maxZ };
}

export type MovableLayerItem = {
  layerName: string;
  input?: { isGrabbing: boolean } | null;
  setPointerEvents(isEnable: boolean): void;
};

/**
 * Rounds a coordinate to the nearest multiple of `interval`, halves going away from zero.
 *
 * A zero or negative interval leaves the number as it is.
 */
export function calcSnapNum(num: number, interval: number): number {
  if (interval <= 0) return num;
  const adjusted = num < 0 ? num - interval / 2 : num + interval / 2;
  return adjusted - (adjusted % interval);
}

/**
 * The top-left corner that puts a piece's anchor on the centre of the nearest hex cell.
 *
 * The anchor lies `halfWidth` / `halfHeight` in from the corner, the piece's middle by default.
 * `HEX_VERTICAL` lays the hexes flat-topped.
 */
export function calcHexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const { colSpacing, rowSpacing } = hexLayoutOf(gridSize, isFlatTop);
  const { col, row } = pixelToHexCell(posX, posY, gridSize, isFlatTop);
  const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);

  return { x: x - halfWidth, y: y - halfHeight };
}

/** The top-left corner that puts a piece's anchor on the nearest corner of a hex cell. */
export function calcHexVertexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const { circumradius, colSpacing, rowSpacing } = hexLayoutOf(gridSize, isFlatTop);
  const corners = hexCornerOffsets(circumradius, isFlatTop);

  const colEst = posX / colSpacing;
  const rowEst = posY / rowSpacing;

  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;

  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x: cx, y: cy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      for (const corner of corners) {
        const vx = cx + corner.x;
        const vy = cy + corner.y;
        const dx = posX - vx;
        const dy = posY - vy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestX = vx;
          bestY = vy;
        }
      }
    }
  }

  return { x: bestX - halfWidth, y: bestY - halfHeight };
}

/**
 * The top-left corner that puts a piece's anchor on the nearer of a hex cell's centre and corner.
 *
 * When both are equally near, the centre wins.
 */
export function calcHexBothSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const center = calcHexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);
  const vertex = calcHexVertexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);

  const dcx = posX - (center.x + halfWidth);
  const dcy = posY - (center.y + halfHeight);
  const dvx = posX - (vertex.x + halfWidth);
  const dvy = posY - (vertex.y + halfHeight);

  return dcx * dcx + dcy * dcy <= dvx * dvx + dvy * dvy ? center : vertex;
}

/** The top-left corner that puts a piece's anchor on the middle of the nearest hex edge. */
export function calcHexEdgeMidpointSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const startAngle = hexStartAngle(isFlatTop);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  // inradius = gridSize / 2
  const edgeDist = gridSize / 2;

  const colEst = posX / colSpacing;
  const rowEst = posY / rowSpacing;

  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;

  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x: cx, y: cy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      for (let k = 0; k < 6; k++) {
        const angle = startAngle + (k + 0.5) * (Math.PI / 3);
        const mx = cx + edgeDist * Math.cos(angle);
        const my = cy + edgeDist * Math.sin(angle);
        const dx = posX - mx;
        const dy = posY - my;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestX = mx;
          bestY = my;
        }
      }
    }
  }

  return { x: bestX - halfWidth, y: bestY - halfHeight };
}

/**
 * The top-left corner that puts a piece's anchor on the nearest hex centre, corner or edge middle.
 *
 * Ties go to the centre first, then the corner.
 */
export function calcHexAllSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const center = calcHexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);
  const vertex = calcHexVertexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);
  const edge = calcHexEdgeMidpointSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);

  const dcx = posX - (center.x + halfWidth);
  const dcy = posY - (center.y + halfHeight);
  const dvx = posX - (vertex.x + halfWidth);
  const dvy = posY - (vertex.y + halfHeight);
  const dex = posX - (edge.x + halfWidth);
  const dey = posY - (edge.y + halfHeight);

  const dc = dcx * dcx + dcy * dcy;
  const dv = dvx * dvx + dvy * dvy;
  const de = dex * dex + dey * dey;

  if (dc <= dv && dc <= de) return center;
  if (dv <= de) return vertex;
  return edge;
}

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
