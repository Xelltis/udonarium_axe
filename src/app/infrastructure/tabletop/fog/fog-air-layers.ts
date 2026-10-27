export interface FogAirLayer {
  /** How high above the floor the sheet hangs, in pixels. */
  heightPx: number;
  alpha: number;
  /** Seconds one drift takes, spread across the layers so they never move as one. */
  durationSec: number;
  /** Where in that drift the layer starts, as a negative delay. */
  delaySec: number;
}

export const FOG_AIR_LAYER_COUNT = 3;
/** How far up the sheets are spread, in cells. */
export const FOG_AIR_TOP_CELLS = 4.5;
const FOG_AIR_BOTTOM_CELLS = 1.1;
const FOG_AIR_TOP_ALPHA = 0.34;
const FOG_AIR_BOTTOM_ALPHA = 0.62;
const DRIFT_BASE_SEC = 74;
const DRIFT_SPREAD_SEC = 23;

/**
 * The sheets of fog that hang over the ground rather than on it.
 *
 * One flat layer reads as paint on the floor however thick it is made. Several of them,
 * spread up through the air and drifting at their own speeds, part as the camera tips and
 * the air between them is what makes it weather.
 */
export function fogAirLayers(gridSizePx: number, count = FOG_AIR_LAYER_COUNT): FogAirLayer[] {
  const layers: FogAirLayer[] = [];
  if (!(gridSizePx > 0) || count < 1) return layers;
  for (let i = 0; i < count; i++) {
    const climb = count === 1 ? 0 : i / (count - 1);
    layers.push({
      heightPx: (FOG_AIR_BOTTOM_CELLS + (FOG_AIR_TOP_CELLS - FOG_AIR_BOTTOM_CELLS) * climb) * gridSizePx,
      alpha: FOG_AIR_BOTTOM_ALPHA + (FOG_AIR_TOP_ALPHA - FOG_AIR_BOTTOM_ALPHA) * climb,
      durationSec: DRIFT_BASE_SEC + DRIFT_SPREAD_SEC * climb,
      delaySec: -DRIFT_BASE_SEC * (i / count),
    });
  }
  return layers;
}
