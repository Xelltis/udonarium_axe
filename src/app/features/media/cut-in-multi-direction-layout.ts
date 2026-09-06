import type { PanelRotationDegrees } from '@axe/application/ui/panel.service';
import { asCutInMultiDirectionMode, type CutInMultiDirectionMode } from '@axe/domain/tabletop/cut-in-multi-direction';
import {
  type RadialMenuSeat,
  seatTextRotation,
} from '@axe/ui/components/four-way-radial-menu/four-way-radial-menu-geometry';

export const CUT_IN_SHARED_EDGE_OVERLAP_RATIO = 0.05;

export interface CutInDirectionRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CutInDirectionFace {
  readonly direction: RadialMenuSeat;
  readonly rotationDegrees: PanelRotationDegrees;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly primary: boolean;
  readonly logicalBounds: CutInDirectionRect;
  readonly permittedBounds: CutInDirectionRect;
}

export interface CutInMultiDirectionLayoutInput {
  readonly mode: CutInMultiDirectionMode | unknown;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly cutInWidth: number;
  readonly cutInHeight: number;
  readonly chromeHeight: number;
}

interface SharedEdges {
  readonly top?: boolean;
  readonly right?: boolean;
  readonly bottom?: boolean;
  readonly left?: boolean;
}

interface FaceRegion {
  readonly direction: RadialMenuSeat;
  readonly bounds: CutInDirectionRect;
  readonly shared: SharedEdges;
}

function rect(left: number, top: number, width: number, height: number): CutInDirectionRect {
  return { left, top, width, height };
}

/**
 * The order is also the initial stacking order: side seats first, then north, with south on top.
 */
function regionsFor(mode: CutInMultiDirectionMode, viewportWidth: number, viewportHeight: number): FaceRegion[] {
  switch (mode) {
    case 'vertical':
      return [
        {
          direction: 'north',
          bounds: rect(viewportWidth / 2, 0, viewportWidth / 2, viewportHeight),
          shared: { left: true },
        },
        {
          direction: 'south',
          bounds: rect(0, 0, viewportWidth / 2, viewportHeight),
          shared: { right: true },
        },
      ];
    case 'vertical-right':
      return [
        {
          direction: 'east',
          bounds: rect((viewportWidth * 2) / 3, 0, viewportWidth / 3, viewportHeight),
          shared: { left: true },
        },
        {
          direction: 'north',
          bounds: rect(0, 0, (viewportWidth * 2) / 3, viewportHeight / 2),
          shared: { right: true, bottom: true },
        },
        {
          direction: 'south',
          bounds: rect(0, viewportHeight / 2, (viewportWidth * 2) / 3, viewportHeight / 2),
          shared: { top: true, right: true },
        },
      ];
    case 'vertical-left':
      return [
        {
          direction: 'west',
          bounds: rect(0, 0, viewportWidth / 3, viewportHeight),
          shared: { right: true },
        },
        {
          direction: 'north',
          bounds: rect(viewportWidth / 3, 0, (viewportWidth * 2) / 3, viewportHeight / 2),
          shared: { left: true, bottom: true },
        },
        {
          direction: 'south',
          bounds: rect(viewportWidth / 3, viewportHeight / 2, (viewportWidth * 2) / 3, viewportHeight / 2),
          shared: { top: true, left: true },
        },
      ];
    case 'four-directions':
      return [
        {
          direction: 'west',
          bounds: rect(0, 0, viewportWidth / 4, viewportHeight),
          shared: { right: true },
        },
        {
          direction: 'east',
          bounds: rect((viewportWidth * 3) / 4, 0, viewportWidth / 4, viewportHeight),
          shared: { left: true },
        },
        {
          direction: 'north',
          bounds: rect(viewportWidth / 4, 0, viewportWidth / 2, viewportHeight / 2),
          shared: { left: true, right: true, bottom: true },
        },
        {
          direction: 'south',
          bounds: rect(viewportWidth / 4, viewportHeight / 2, viewportWidth / 2, viewportHeight / 2),
          shared: { top: true, left: true, right: true },
        },
      ];
    default:
      return [];
  }
}

function permittedBounds(
  bounds: CutInDirectionRect,
  shared: SharedEdges,
  viewportWidth: number,
  viewportHeight: number
): CutInDirectionRect {
  const horizontalOverlap = bounds.width * CUT_IN_SHARED_EDGE_OVERLAP_RATIO;
  const verticalOverlap = bounds.height * CUT_IN_SHARED_EDGE_OVERLAP_RATIO;
  const left = Math.max(0, bounds.left - (shared.left ? horizontalOverlap : 0));
  const top = Math.max(0, bounds.top - (shared.top ? verticalOverlap : 0));
  const right = Math.min(viewportWidth, bounds.left + bounds.width + (shared.right ? horizontalOverlap : 0));
  const bottom = Math.min(viewportHeight, bounds.top + bounds.height + (shared.bottom ? verticalOverlap : 0));
  return rect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function fitPanel(
  direction: RadialMenuSeat,
  logicalBounds: CutInDirectionRect,
  permittedBounds: CutInDirectionRect,
  cutInWidth: number,
  cutInHeight: number,
  chromeHeight: number
): Pick<CutInDirectionFace, 'left' | 'top' | 'width' | 'height' | 'rotationDegrees'> {
  const rotationDegrees = seatTextRotation(direction) as PanelRotationDegrees;
  const sideways = rotationDegrees === 90 || rotationDegrees === 270;
  const maxPanelWidth = sideways ? permittedBounds.height : permittedBounds.width;
  const maxPanelHeight = sideways ? permittedBounds.width : permittedBounds.height;
  const chrome = Math.min(Math.max(0, chromeHeight), maxPanelHeight);
  const sourceWidth = Math.max(0, cutInWidth);
  const sourceHeight = Math.max(0, cutInHeight);
  const widthScale = sourceWidth > 0 ? maxPanelWidth / sourceWidth : 1;
  const heightScale = sourceHeight > 0 ? Math.max(0, maxPanelHeight - chrome) / sourceHeight : 1;
  const scale = Math.max(0, Math.min(1, widthScale, heightScale));
  const width = Math.min(maxPanelWidth, sourceWidth * scale);
  const height = Math.min(maxPanelHeight, sourceHeight * scale + chrome);
  const visualWidth = sideways ? height : width;
  const visualHeight = sideways ? width : height;
  const logicalCenterX = logicalBounds.left + logicalBounds.width / 2;
  const logicalCenterY = logicalBounds.top + logicalBounds.height / 2;
  const minCenterX = permittedBounds.left + visualWidth / 2;
  const maxCenterX = permittedBounds.left + permittedBounds.width - visualWidth / 2;
  const minCenterY = permittedBounds.top + visualHeight / 2;
  const maxCenterY = permittedBounds.top + permittedBounds.height - visualHeight / 2;
  const centerX = Math.max(minCenterX, Math.min(logicalCenterX, maxCenterX));
  const centerY = Math.max(minCenterY, Math.min(logicalCenterY, maxCenterY));

  return {
    rotationDegrees,
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
  };
}

export function makeCutInMultiDirectionLayout(input: CutInMultiDirectionLayoutInput): CutInDirectionFace[] {
  const mode = asCutInMultiDirectionMode(input.mode);
  const viewportWidth = Math.max(0, input.viewportWidth);
  const viewportHeight = Math.max(0, input.viewportHeight);

  return regionsFor(mode, viewportWidth, viewportHeight).map((region) => {
    const permitted = permittedBounds(region.bounds, region.shared, viewportWidth, viewportHeight);
    return {
      direction: region.direction,
      primary: region.direction === 'south',
      logicalBounds: region.bounds,
      permittedBounds: permitted,
      ...fitPanel(region.direction, region.bounds, permitted, input.cutInWidth, input.cutInHeight, input.chromeHeight),
    };
  });
}
