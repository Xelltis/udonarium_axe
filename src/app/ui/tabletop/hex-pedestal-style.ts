import {
  buildHexHoleInCircleClipPath,
  buildHexRingClipPath,
  HexFlowerParams,
} from '@axe/domain/tabletop/hex-flower-geometry';

/**
 * The rim of a pedestal on a hex grid: the outline of the cells the piece stands on, `ringPx`
 * thick and filled with `color`, laid over the cell the piece is drawn from.
 */
export function hexPedestalRingStyle(params: HexFlowerParams, ringPx: number, color: string): Record<string, string> {
  const { outline, bbox, L } = params;
  return {
    background: color,
    clipPath: buildHexRingClipPath(outline, bbox, ringPx),
    border: 'none',
    borderRadius: '0',
    width: `${bbox.maxX - bbox.minX}px`,
    height: `${bbox.maxY - bbox.minY}px`,
    left: `${bbox.minX + L / 2}px`,
    top: `${bbox.minY + L / 2}px`,
  };
}

/** How the round handle that turns a piece on a hex grid is drawn. */
export interface HexPedestalGrab {
  /** How far past the corners of the pedestal the handle reaches, in pixels. */
  readonly reachPx: number;
  /** Whether the pedestal is cut out of the handle, so a press inside the rim moves the piece rather than turns it. */
  readonly pedestalCutOut?: boolean;
}

/** The round handle round a pedestal on a hex grid that turns the piece. */
export function hexPedestalGrabStyle(params: HexFlowerParams, grab: HexPedestalGrab): Record<string, string> {
  const { bbox, L } = params;
  const halfW = (bbox.maxX - bbox.minX) / 2;
  const halfH = (bbox.maxY - bbox.minY) / 2;
  const radius = Math.sqrt(halfW * halfW + halfH * halfH) + grab.reachPx;
  const diameter = radius * 2;
  const style: Record<string, string> = {
    width: `${diameter}px`,
    height: `${diameter}px`,
    left: `${L / 2 - radius}px`,
    top: `${L / 2 - radius}px`,
    borderRadius: '50%',
  };
  if (grab.pedestalCutOut) style['clipPath'] = buildHexHoleInCircleClipPath(params.outline, radius);
  return style;
}
