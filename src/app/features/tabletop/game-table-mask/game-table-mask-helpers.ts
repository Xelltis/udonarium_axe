import { PERF_HEX_MASK_SVG, perfCounters } from '@axe/core/util/perf-counters';
import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCircumradius,
  hexCornerOffsets,
  hexSpacing,
  isFlatTopGrid,
  isHexGrid,
} from '@axe/domain/tabletop/hex-geometry';
import { computeHexMaskGeometry, HexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';

export interface BuildMaskCssParams {
  currentScratchingSet: Set<string> | null;
  gridSize: number;
  gridType: GridType;
  height: number;
  isNonScratched: boolean;
  isPreviewMode: boolean;
  scratchedGrids: string;
  scratchingGrids: string;
  width: number;
}

export interface BuildScratchingGridInfosParams {
  currentScratchingSet: Set<string> | null;
  gridSize: number;
  gridType: GridType;
  hasGameTableMask: boolean;
  height: number;
  isNonScratched: boolean;
  isNonScratching: boolean;
  scratchedGrids: string;
  scratchingGrids: string;
  width: number;
}

export interface ScratchGridInfo {
  cx: number;
  cy: number;
  hexPoints?: string;
  state: string;
  x: number;
  y: number;
}

function splitGridSet(value: string): Set<string> {
  return new Set(value.split(/,/g));
}

function isCellVisible(
  gridStr: string,
  scratchedSet: Set<string>,
  scratchingSet: Set<string>,
  isPreviewMode: boolean
): boolean {
  if (isPreviewMode) {
    if (scratchedSet.has(gridStr) && !scratchingSet.has(gridStr)) return false;
    if (scratchingSet.has(gridStr) && !scratchedSet.has(gridStr)) return false;
  } else if (scratchedSet.has(gridStr)) {
    return false;
  }
  return true;
}

function buildHexSvgMask(polygons: string[], pixelW: number, pixelH: number): string {
  if (!polygons.length) return EMPTY_MASK;
  perfCounters.bump(PERF_HEX_MASK_SVG);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelW}" height="${pixelH}"><g fill="#000">${polygons.join('')}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}") 0px 0px / ${pixelW}px ${pixelH}px no-repeat`;
}

const EMPTY_MASK = 'radial-gradient(#000, #000) 0px 0px / 0px 0px no-repeat';

const HEX_SHAPE_CACHE_LIMIT = 16;
const outlineMasks = new Map<string, string>();
const outerBorders = new Map<string, string>();

/**
 * The string built for a key, built once and kept among the most recently asked for.
 *
 * The key holds every argument the string is built from, so a kept string is always the one the
 * builder would give.
 */
function remembered(kept: Map<string, string>, key: string, build: () => string): string {
  const held = kept.get(key);
  if (held !== undefined) {
    kept.delete(key);
    kept.set(key, held);
    return held;
  }
  const built = build();
  if (kept.size >= HEX_SHAPE_CACHE_LIMIT) kept.delete(kept.keys().next().value as string);
  kept.set(key, built);
  return built;
}

function visibilityOf(params: BuildMaskCssParams): (gridStr: string) => boolean {
  const scratchedSet = splitGridSet(params.scratchedGrids);
  const scratchingSet = params.currentScratchingSet ?? splitGridSet(params.scratchingGrids);
  return (gridStr) => isCellVisible(gridStr, scratchedSet, scratchingSet, params.isPreviewMode);
}

function hexCellPolygons(
  params: BuildMaskCssParams,
  include: (gridStr: string) => boolean
): { polygons: string[]; geo: HexMaskGeometry } | null {
  const geo = computeHexMaskGeometry(params.width, params.height, params.gridSize, params.gridType);
  if (!geo) return null;
  const isFlatTop = isFlatTopGrid(params.gridType);
  const s = hexCircumradius(params.gridSize);
  const maskS = s + 1;
  const { colSpacing, rowSpacing } = hexSpacing(params.gridSize, isFlatTop);

  const verts = hexCornerOffsets(maskS, isFlatTop);

  const polygons: string[] = [];
  for (let col = 0; col < params.width; col++) {
    for (let row = 0; row < params.height; row++) {
      if (!include(`${col}:${row}`)) continue;

      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const cx = x + geo.offsetX;
      const cy = y + geo.offsetY;
      const points = verts.map((v) => `${cx + v.x},${cy + v.y}`).join(' ');
      polygons.push(`<polygon points="${points}"/>`);
    }
  }
  return { polygons, geo };
}

function squareCellMasks(params: BuildMaskCssParams, include: (gridStr: string) => boolean): string[] {
  const masks: string[] = [];
  for (let x = 0; x < params.width; x++) {
    for (let y = 0; y < params.height; y++) {
      if (!include(`${x}:${y}`)) continue;

      masks.push(
        `radial-gradient(#000, #000) ${x * params.gridSize - 1}px ${y * params.gridSize - 1}px / ${params.gridSize + 2}px ${params.gridSize + 2}px no-repeat`
      );
    }
  }
  return masks;
}

function buildHexMaskSvg(params: BuildMaskCssParams): string {
  const cells = hexCellPolygons(params, visibilityOf(params));
  if (!cells) return EMPTY_MASK;
  return buildHexSvgMask(cells.polygons, cells.geo.pixelW, cells.geo.pixelH);
}

/**
 * A CSS mask in the shape of a mask's hex cells, each grown by a pixel so neighbours meet without a
 * seam.
 *
 * Empty on a square grid or when there are no cells.
 */
export function buildHexOutlineMask(gridSize: number, gridType: GridType, width: number, height: number): string {
  return remembered(outlineMasks, `${gridSize}|${gridType}|${width}|${height}`, () =>
    buildHexOutlineMaskAfresh(gridSize, gridType, width, height)
  );
}

function buildHexOutlineMaskAfresh(gridSize: number, gridType: GridType, width: number, height: number): string {
  const geo = computeHexMaskGeometry(width, height, gridSize, gridType);
  if (!geo) return '';
  const isFlatTop = isFlatTopGrid(gridType);
  const s = hexCircumradius(gridSize);
  const maskS = s + 1;
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);

  const verts = hexCornerOffsets(maskS, isFlatTop);

  const polygons: string[] = [];
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) {
      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const cx = x + geo.offsetX;
      const cy = y + geo.offsetY;
      const points = verts.map((v) => `${cx + v.x},${cy + v.y}`).join(' ');
      polygons.push(`<polygon points="${points}"/>`);
    }
  }

  if (!polygons.length) return '';
  return buildHexSvgMask(polygons, geo.pixelW, geo.pixelH);
}

/**
 * A CSS background tracing a light line round the outer edge of a mask's hex cells, leaving the
 * inner edges out.
 *
 * Empty on a square grid or when there are no cells.
 */
export function buildHexOuterBorderSvg(gridSize: number, gridType: GridType, width: number, height: number): string {
  return remembered(outerBorders, `${gridSize}|${gridType}|${width}|${height}`, () =>
    buildHexOuterBorderSvgAfresh(gridSize, gridType, width, height)
  );
}

function buildHexOuterBorderSvgAfresh(gridSize: number, gridType: GridType, width: number, height: number): string {
  const geo = computeHexMaskGeometry(width, height, gridSize, gridType);
  if (!geo) return '';
  const isFlatTop = isFlatTopGrid(gridType);
  const s = hexCircumradius(gridSize);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const verts = hexCornerOffsets(s, isFlatTop);

  const lines: string[] = [];
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) {
      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const cx = x + geo.offsetX;
      const cy = y + geo.offsetY;
      // Which cell lies across a side turns on the column (flat-topped) or the row
      // (pointy-topped), so the six of them are read once for the cell rather than once a side.
      const sides = hexSideStepsAt(isFlatTop, col, row);

      for (let i = 0; i < 6; i++) {
        const [dq, dr] = sides[i];
        const nq = col + dq;
        const nr = row + dr;
        if (nq >= 0 && nq < width && nr >= 0 && nr < height) continue;

        const v1 = verts[i];
        const v2 = verts[(i + 1) % 6];
        lines.push(`<line x1="${cx + v1.x}" y1="${cy + v1.y}" x2="${cx + v2.x}" y2="${cy + v2.y}"/>`);
      }
    }
  }

  if (!lines.length) return '';
  perfCounters.bump(PERF_HEX_MASK_SVG);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${geo.pixelW}" height="${geo.pixelH}">` +
    `<g stroke="#ccc" stroke-width="2" stroke-linecap="round">${lines.join('')}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}") 0px 0px / ${geo.pixelW}px ${geo.pixelH}px no-repeat`;
}

/**
 * The CSS mask that cuts the scratched-open cells out of a mask.
 *
 * In preview mode, a cell a pending scratch would change is shown as it will be once the scratch is
 * done. An empty string leaves the mask whole, and on a hex grid the mask is drawn as SVG.
 */
export function buildMaskCss(params: BuildMaskCssParams): string {
  if (isHexGrid(params.gridType)) return buildHexMaskSvg(params);

  if (!params.isPreviewMode && params.isNonScratched) return '';

  const masks = squareCellMasks(params, visibilityOf(params));
  return masks.length ? masks.join(',') : EMPTY_MASK;
}

/**
 * The CSS mask that keeps only the cells {@link buildMaskCss} cuts out of a mask: those scratched
 * open, or in preview mode those the pending scratch would leave open.
 *
 * Each cell grows by the same pixel as in the mask itself, so the two meet without a seam, and a
 * hex grid is drawn as SVG. Empty when no cell is open, on either kind of grid.
 */
export function buildScratchedMaskCss(params: BuildMaskCssParams): string {
  if (!params.isPreviewMode && params.isNonScratched) return '';
  const isVisible = visibilityOf(params);
  const isOpen = (gridStr: string) => !isVisible(gridStr);

  if (isHexGrid(params.gridType)) {
    const cells = hexCellPolygons(params, isOpen);
    if (!cells || !cells.polygons.length) return '';
    return buildHexSvgMask(cells.polygons, cells.geo.pixelW, cells.geo.pixelH);
  }

  return squareCellMasks(params, isOpen).join(',');
}

/**
 * The markers drawn over cells while a mask is being scratched, one for each cell that is open,
 * picked, or both.
 *
 * Each marker carries its cell's centre and a state: `scrached` for an open cell, `scraching` for a
 * picked covered cell, and `restore` for an open cell that is picked to be covered again. Hex cells
 * also carry an inset outline.
 */
export function buildScratchingGridInfos(params: BuildScratchingGridInfosParams): ScratchGridInfo[] {
  const ret: ScratchGridInfo[] = [];
  if (!params.hasGameTableMask || (params.isNonScratching && params.isNonScratched)) return ret;

  const scratchingGridSet = params.currentScratchingSet ?? splitGridSet(params.scratchingGrids);
  const scratchedGridSet = splitGridSet(params.scratchedGrids);

  const hex = isHexGrid(params.gridType);
  const isFlatTop = hex ? isFlatTopGrid(params.gridType) : false;

  let cols: number;
  let rows: number;
  let geo: HexMaskGeometry | null = null;
  if (hex) {
    geo = computeHexMaskGeometry(params.width, params.height, params.gridSize, params.gridType);
    cols = params.width;
    rows = params.height;
  } else {
    cols = Math.ceil(params.width);
    rows = Math.ceil(params.height);
  }

  let insetVertOffsets: { x: number; y: number }[] | null = null;
  if (hex) {
    const s = hexCircumradius(params.gridSize);
    const insetS = Math.max(s - 5, s * 0.7);
    insetVertOffsets = hexCornerOffsets(insetS, isFlatTop);
  }

  const { colSpacing, rowSpacing } = hex ? hexSpacing(params.gridSize, isFlatTop) : { colSpacing: 0, rowSpacing: 0 };

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const gridStr = `${x}:${y}`;
      if (!scratchingGridSet.has(gridStr) && !scratchedGridSet.has(gridStr)) continue;

      const state = !scratchingGridSet.has(gridStr)
        ? 'scrached'
        : !scratchedGridSet.has(gridStr)
          ? 'scraching'
          : 'restore';

      let cx: number;
      let cy: number;
      let hexPoints: string | undefined;

      if (hex && geo) {
        const center = hexCellCenter(x, y, colSpacing, rowSpacing, isFlatTop);
        cx = center.x + geo.offsetX;
        cy = center.y + geo.offsetY;
        hexPoints = insetVertOffsets!.map((v) => `${cx + v.x},${cy + v.y}`).join(' ');
      } else {
        cx = (x + 0.5) * params.gridSize;
        cy = (y + 0.5) * params.gridSize;
      }

      ret.push({ x, y, cx, cy, state, hexPoints });
    }
  }

  return ret;
}
