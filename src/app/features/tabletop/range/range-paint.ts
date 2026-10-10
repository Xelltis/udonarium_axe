import { cellPatternBoundingBox, parseCellPattern } from '@axe/domain/tabletop/cell-pattern';
import { RangeArea } from '@axe/domain/tabletop/range';
import {
  ClipAreaCorn,
  ClipAreaHexagon,
  ClipAreaLine,
  ClipAreaPentagon,
  ClipAreaSquare,
  ClipAreaTriangle,
  RangeRender,
  RangeRenderSetting,
} from '@axe/features/tabletop/range/range-render';
import { clipAreaToPolygonCss, clipCircleCss } from '@axe/features/tabletop/range/range-render-util';

type ClipArea = ClipAreaLine | ClipAreaSquare | ClipAreaTriangle | ClipAreaPentagon | ClipAreaHexagon | ClipAreaCorn;

/**
 * What a painted range is cut to: a polygon for most shapes, a circle for a circle, and for a
 * custom shape a box as far out as its cells reach.
 */
export type RangeClip =
  | { kind: 'polygon'; area: ClipArea }
  | { kind: 'circle' }
  | { kind: 'custom'; halfWidthPx: number; halfHeightPx: number };

/** What a range is painted with beyond the range itself. */
export interface RangePaintOptions {
  gridSize: number;
  /** The grid of the table it lies on, which its cells line up with. */
  gridType: number;
  /** Whether it follows a character, which marks its origin differently. */
  docked: boolean;
  /** The turn it is painted at, which a turn under way gives ahead of the range's own. */
  degree?: number;
}

/**
 * How many cells out from its origin a range's canvases reach on every side: far enough for the
 * shape at any turn, and a cell to spare.
 */
export function rangeQuadrantCells(range: RangeArea): number {
  if (range.type === 'CUSTOM') {
    const box = cellPatternBoundingBox(parseCellPattern(range.cellPattern));
    return Math.ceil(Math.max(box.width, box.height, 1)) + 1;
  }
  const width = Math.max(1, Math.max(0, range.width));
  const length = Math.max(1, Math.max(0, range.length));
  return Math.ceil(Math.sqrt(width * width + length * length)) + 1;
}

/** The settings the painters are handed for a range. */
export function rangeRenderSettingOf(range: RangeArea, options: RangePaintOptions): RangeRenderSetting {
  const quadrant = rangeQuadrantCells(range);
  const width = Math.max(0, range.width);
  const length = Math.max(0, range.length);
  return {
    areaWidth: quadrant * 2,
    areaHeight: quadrant * 2,
    range: length < 1 ? 1 : length,
    width: width < 0.1 ? 0.1 : width,
    centerX: range.location.x,
    centerY: range.location.y,
    gridSize: options.gridSize,
    type: range.type,
    gridColor: range.gridColor,
    rangeColor: range.rangeColor,
    fanDegree: 0.0,
    degree: options.degree ?? range.rotate,
    offSetX: range.offSetX,
    offSetY: range.offSetY,
    fillOutLine: range.fillOutLine,
    gridType: options.gridType,
    isDocking: options.docked,
  };
}

/**
 * Paints a range into its pair of canvases, the cells it covers into the first and its outline
 * into the second, sizing both, and gives back what the first is to be cut to.
 */
export function paintRange(
  gridCanvas: HTMLCanvasElement,
  rangeCanvas: HTMLCanvasElement,
  range: RangeArea,
  options: RangePaintOptions
): RangeClip {
  const render = new RangeRender(gridCanvas, rangeCanvas);
  const setting = rangeRenderSettingOf(range, options);
  switch (range.type) {
    case 'LINE':
      return { kind: 'polygon', area: render.renderLine(setting) };
    case 'CIRCLE':
      render.renderCircle(setting);
      return { kind: 'circle' };
    case 'SQUARE':
      return { kind: 'polygon', area: render.renderSquare(setting) };
    case 'RHOMBUS':
      return { kind: 'polygon', area: render.renderDiamond(setting) };
    case 'TRIANGLE':
      return { kind: 'polygon', area: render.renderTriangle(setting) };
    case 'PENTAGON':
      return { kind: 'polygon', area: render.renderPentagon(setting) };
    case 'HEXAGON':
      return { kind: 'polygon', area: render.renderHexagon(setting) };
    case 'CUSTOM': {
      const box = render.renderCustom(setting, { cellPattern: range.cellPattern, rotationDegrees: setting.degree });
      return { kind: 'custom', halfWidthPx: box.halfWidthPx, halfHeightPx: box.halfHeightPx };
    }
    case 'CORN':
    default:
      return { kind: 'polygon', area: render.renderCorn(setting) };
  }
}

/** The CSS clip-path a range's cell canvas is cut to. */
export function rangeClipPathCss(clip: RangeClip, range: RangeArea, gridSize: number): string {
  switch (clip.kind) {
    case 'circle':
      return clipCircleCss(range.length, gridSize);
    case 'custom': {
      const hx = Math.max(gridSize, clip.halfWidthPx) + gridSize;
      const hy = Math.max(gridSize, clip.halfHeightPx) + gridSize;
      return `polygon(${-hx}px ${-hy}px, ${hx}px ${-hy}px, ${hx}px ${hy}px, ${-hx}px ${hy}px)`;
    }
    case 'polygon':
      return clipAreaToPolygonCss(clip.area);
  }
}

/** What a range is cut to before it has first been painted, by its type. */
export function initialRangeClip(type: string): RangeClip {
  switch (type) {
    case 'CIRCLE':
      return { kind: 'circle' };
    case 'CUSTOM':
      return { kind: 'custom', halfWidthPx: 25, halfHeightPx: 25 };
    case 'LINE':
    case 'SQUARE':
    case 'RHOMBUS':
      return {
        kind: 'polygon',
        area: {
          clip01x: 0,
          clip01y: 0,
          clip02x: 0,
          clip02y: -50,
          clip03x: 100,
          clip03y: -50,
          clip04x: 100,
          clip04y: 0,
        },
      };
    case 'TRIANGLE':
      return {
        kind: 'polygon',
        area: { clip01x: 0, clip01y: -100, clip02x: 100, clip02y: 100, clip03x: -100, clip03y: 100 },
      };
    case 'PENTAGON':
      return {
        kind: 'polygon',
        area: {
          clip01x: 0,
          clip01y: -100,
          clip02x: 100,
          clip02y: -30,
          clip03x: 60,
          clip03y: 100,
          clip04x: -60,
          clip04y: 100,
          clip05x: -100,
          clip05y: -30,
        },
      };
    case 'HEXAGON':
      return {
        kind: 'polygon',
        area: {
          clip01x: 0,
          clip01y: -100,
          clip02x: 100,
          clip02y: -50,
          clip03x: 100,
          clip03y: 50,
          clip04x: 0,
          clip04y: 100,
          clip05x: -100,
          clip05y: 50,
          clip06x: -100,
          clip06y: -50,
        },
      };
    case 'CORN':
    default:
      return {
        kind: 'polygon',
        area: {
          clip01x: 0,
          clip01y: 0,
          clip02x: 100,
          clip02y: 0,
          clip03x: 100,
          clip03y: 100,
          clip04x: 0,
          clip04y: 100,
          clip05x: 0,
          clip05y: 0,
          clip06x: 0,
          clip06y: 0,
          clip07x: 0,
          clip07y: 0,
          clip08x: 0,
          clip08y: 0,
          clip09x: 0,
          clip09y: 0,
        },
      };
  }
}
