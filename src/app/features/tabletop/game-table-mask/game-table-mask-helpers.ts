import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
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

function hexVertOffsets(s: number, isFlatTop: boolean): { x: number; y: number }[] {
  const startAngle = hexStartAngle(isFlatTop);
  const offsets: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    offsets.push({ x: s * Math.cos(angle), y: s * Math.sin(angle) });
  }
  return offsets;
}

function buildHexSvgMask(polygons: string[], pixelW: number, pixelH: number): string {
  if (!polygons.length) return EMPTY_MASK;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelW}" height="${pixelH}"><g fill="#000">${polygons.join('')}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}") 0px 0px / ${pixelW}px ${pixelH}px no-repeat`;
}

const EMPTY_MASK = 'radial-gradient(#000, #000) 0px 0px / 0px 0px no-repeat';

function buildHexMaskSvg(params: BuildMaskCssParams): string {
  const geo = computeHexMaskGeometry(params.width, params.height, params.gridSize, params.gridType);
  if (!geo) return EMPTY_MASK;
  const isFlatTop = isFlatTopGrid(params.gridType);
  const s = hexCircumradius(params.gridSize);
  const maskS = s + 1;
  const { colSpacing, rowSpacing } = hexSpacing(params.gridSize, isFlatTop);

  const scratchedSet = splitGridSet(params.scratchedGrids);
  const scratchingSet = params.currentScratchingSet ?? splitGridSet(params.scratchingGrids);

  const verts = hexVertOffsets(maskS, isFlatTop);

  const polygons: string[] = [];
  for (let col = 0; col < params.width; col++) {
    for (let row = 0; row < params.height; row++) {
      const gridStr = `${col}:${row}`;
      if (!isCellVisible(gridStr, scratchedSet, scratchingSet, params.isPreviewMode)) continue;

      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const cx = x + geo.offsetX;
      const cy = y + geo.offsetY;
      const points = verts.map((v) => `${cx + v.x},${cy + v.y}`).join(' ');
      polygons.push(`<polygon points="${points}"/>`);
    }
  }

  return buildHexSvgMask(polygons, geo.pixelW, geo.pixelH);
}

/**
 * A CSS mask in the shape of a mask's hex cells, each grown by a pixel so neighbours meet without a
 * seam.
 *
 * Empty on a square grid or when there are no cells.
 */
export function buildHexOutlineMask(gridSize: number, gridType: GridType, width: number, height: number): string {
  const geo = computeHexMaskGeometry(width, height, gridSize, gridType);
  if (!geo) return '';
  const isFlatTop = isFlatTopGrid(gridType);
  const s = hexCircumradius(gridSize);
  const maskS = s + 1;
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);

  const verts = hexVertOffsets(maskS, isFlatTop);

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

function hexNeighborOffset(col: number, row: number, edgeIdx: number, isFlatTop: boolean): readonly [number, number] {
  if (isFlatTop) {
    const even = col % 2 === 0;
    return even
      ? (
          [
            [1, 0],
            [0, 1],
            [-1, 0],
            [-1, -1],
            [0, -1],
            [1, -1],
          ] as const
        )[edgeIdx]
      : (
          [
            [1, 1],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [0, -1],
            [1, 0],
          ] as const
        )[edgeIdx];
  }
  const even = row % 2 === 0;
  return even
    ? (
        [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 1],
          [-1, 0],
          [-1, -1],
        ] as const
      )[edgeIdx]
    : (
        [
          [1, -1],
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 0],
          [0, -1],
        ] as const
      )[edgeIdx];
}

/**
 * A CSS background tracing a light line round the outer edge of a mask's hex cells, leaving the
 * inner edges out.
 *
 * Empty on a square grid or when there are no cells.
 */
export function buildHexOuterBorderSvg(gridSize: number, gridType: GridType, width: number, height: number): string {
  const geo = computeHexMaskGeometry(width, height, gridSize, gridType);
  if (!geo) return '';
  const isFlatTop = isFlatTopGrid(gridType);
  const s = hexCircumradius(gridSize);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const verts = hexVertOffsets(s, isFlatTop);

  const lines: string[] = [];
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) {
      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const cx = x + geo.offsetX;
      const cy = y + geo.offsetY;

      for (let i = 0; i < 6; i++) {
        const [dq, dr] = hexNeighborOffset(col, row, i, isFlatTop);
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

  const masks: string[] = [];
  const scratchedSet = splitGridSet(params.scratchedGrids);
  const scratchingSet = params.currentScratchingSet ?? splitGridSet(params.scratchingGrids);

  for (let x = 0; x < params.width; x++) {
    for (let y = 0; y < params.height; y++) {
      const gridStr = `${x}:${y}`;
      if (!isCellVisible(gridStr, scratchedSet, scratchingSet, params.isPreviewMode)) continue;

      masks.push(
        `radial-gradient(#000, #000) ${x * params.gridSize - 1}px ${y * params.gridSize - 1}px / ${params.gridSize + 2}px ${params.gridSize + 2}px no-repeat`
      );
    }
  }

  return masks.length ? masks.join(',') : EMPTY_MASK;
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
    insetVertOffsets = hexVertOffsets(insetS, isFlatTop);
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
