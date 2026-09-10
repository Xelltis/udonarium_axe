import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { GridType } from '@axe/domain/tabletop/game-table';
import { hexCellCenter, hexCircumradius, hexSpacing, hexStartAngle } from '@axe/domain/tabletop/hex-geometry';
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
}

export interface ContactRider {
  altitudePx: number;
  thicknessPx: number;
  ridesUp: boolean;
  bottomZ: number;
}

const CONTACT_EPSILON_PX = 0.5;
const CONTACT_MIN_THICKNESS_PX = 1;

const FLAT_ON_THE_FLOOR: ContactRider = { altitudePx: 0, thicknessPx: 0, ridesUp: true, bottomZ: 0 };

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

export function findContactSupportZ(
  footprints: readonly ContactFootprint[],
  centerX: number,
  centerY: number,
  rider: ContactRider = FLAT_ON_THE_FLOOR
): number {
  const levels = contactRestLevels(footprints, centerX, centerY, rider);
  let held = -Infinity;
  for (const level of levels) {
    if (level <= rider.bottomZ + CONTACT_EPSILON_PX && level > held) held = level;
  }
  if (held > -Infinity) return held;
  if (levels.length > 0) return levels[0];

  let highest = 0;
  for (const footprint of footprintsUnder(footprints, centerX, centerY)) {
    if (footprint.topZ > highest) highest = footprint.topZ;
  }
  return highest;
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
    under.push(footprint);
  }
  return under;
}

function contactLevels(under: readonly ContactFootprint[]): number[] {
  const levels = [0];
  for (const footprint of under) {
    if (footprint.topZ > 0) levels.push(footprint.topZ);
  }
  return levels;
}

function riderBottomAt(rider: ContactRider, level: number): number {
  return rider.ridesUp ? level + rider.altitudePx : Math.max(rider.altitudePx, level);
}

function riderFits(under: readonly ContactFootprint[], rider: ContactRider, level: number): boolean {
  const bottom = riderBottomAt(rider, level);
  const top = bottom + Math.max(rider.thicknessPx, CONTACT_MIN_THICKNESS_PX);
  for (const footprint of under) {
    if (bottom >= footprint.topZ - CONTACT_EPSILON_PX) continue;
    if (top > footprint.bottomZ + CONTACT_EPSILON_PX) return false;
  }
  return true;
}

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

export function calcSnapNum(num: number, interval: number): number {
  if (interval <= 0) return num;
  const adjusted = num < 0 ? num - interval / 2 : num + interval / 2;
  return adjusted - (adjusted % interval);
}

export function calcHexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);

  const colEst = posX / colSpacing;
  const rowEst = posY / rowSpacing;

  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;

  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x: hx, y: hy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);

      const dx = posX - hx;
      const dy = posY - hy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestX = hx;
        bestY = hy;
      }
    }
  }

  return { x: bestX - halfWidth, y: bestY - halfHeight };
}

export function calcHexVertexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const s = hexCircumradius(gridSize);
  const startAngle = hexStartAngle(isFlatTop);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);

  const colEst = posX / colSpacing;
  const rowEst = posY / rowSpacing;

  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;

  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x: cx, y: cy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      for (let k = 0; k < 6; k++) {
        const angle = startAngle + (k * Math.PI) / 3;
        const vx = cx + s * Math.cos(angle);
        const vy = cy + s * Math.sin(angle);
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

export function toTransformCss(posX: number, posY: number, posZ: number, transformCssOffset: string): string {
  return 'translate3d(' + posX + 'px,' + posY + 'px,' + posZ + 'px) ' + transformCssOffset;
}

export function shouldTransitionTo(
  object: TabletopObject | null | undefined,
  posX: number,
  posY: number,
  posZ: number
): boolean {
  if (!object?.location) return false;
  return object.location.x !== posX || object.location.y !== posY || object.posZ !== posZ;
}

export function resolveMovableLocalCoordinate(
  coordinateService: MovableCoordinateResolver,
  surfaceElement: HTMLElement,
  pointer2d: PointerCoordinate,
  contactSupportZ: (centerX: number, centerY: number) => number
): PointerCoordinate {
  const local = coordinateService.convertToLocal(pointer2d, surfaceElement);
  return { x: local.x, y: local.y, z: Math.max(0, contactSupportZ(local.x, local.y)) };
}

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

export function applyPointerEvents(elements: HTMLElement[], isEnable: boolean) {
  const css = isEnable ? 'auto' : 'none';
  elements.forEach((element) => (element.style.pointerEvents = css));
}

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
      // PointerDeviceService treats as drag-end and cancels the drag (the original bug).
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

export function registerLayer(
  layerHash: { [layerName: string]: MovableLayerItem[] },
  layerName: string,
  self: MovableLayerItem
) {
  if (!(layerName in layerHash)) layerHash[layerName] = [];
  const index = layerHash[layerName].indexOf(self);
  if (index < 0) layerHash[layerName].push(self);
}

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
 * its own corner happens to be, which is how a board came to leap about the table.
 */
export function dropTargetSurface(dragged: Element, under: Element | null): HTMLElement | null {
  const surface = under?.closest<HTMLElement>('[data-surface]') ?? null;
  if (!surface || dragged.contains(surface)) return null;
  return surface;
}
