import { hexCircumradius, hexStartAngle } from '@axe/domain/tabletop/hex-geometry';
import { SlopeDirection } from '@axe/domain/tabletop/terrain';

export interface HexSlopeStepFloor {
  heightPx: number;
  mask: string;
}

export interface HexSlopeStepWall {
  edgeLength: number;
  px: number;
  py: number;
  angle: number;
  brightness: number;
  wallHeightPx: number;
  basePx: number;
}

export interface HexSlopeStepData {
  floors: HexSlopeStepFloor[];
  walls: HexSlopeStepWall[];
}

/**
 * Breaks a slope on a hex terrain into flat steps, one for each row of hexes across the slope's
 * direction.
 *
 * The terrain is taken as a hexagon of hexes `size` cells across, up to 6. Each floor gets its
 * height and an SVG mask over its hexes; each wall is a face dropping from a step to a lower one or
 * to the ground, with its placement, height, base and shading. Nothing comes back for a size that
 * is not a whole number of at least 2, or for a terrain with no slope.
 */
export function computeHexSlopeSteps(
  size: number,
  gridSize: number,
  isFlatTop: boolean,
  slopeDir: SlopeDirection,
  totalHeight: number,
  useSurfaceShading: boolean,
  containerW: number,
  containerH: number,
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
): HexSlopeStepData {
  if (size % 1 !== 0 || size < 2 || slopeDir === SlopeDirection.NONE) {
    return { floors: [], walls: [] };
  }

  const d = Math.min(Math.max(Math.round(size), 1), 6) - 1;
  const s = hexCircumradius(gridSize);
  const g = gridSize;
  const startAngle = hexStartAngle(isFlatTop);
  const totalHeightPx = totalHeight * gridSize;
  const bboxW = bbox.maxX - bbox.minX;
  const bboxH = bbox.maxY - bbox.minY;

  const cubeToPixel = (q: number, r: number): { x: number; y: number } => {
    if (isFlatTop) return { x: 1.5 * s * q, y: (g / 2) * q + g * r };
    return { x: g * q + (g / 2) * r, y: 1.5 * s * r };
  };

  const neighborDirs: readonly (readonly [number, number])[] = isFlatTop
    ? [
        [1, 0],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [0, -1],
        [1, -1],
      ]
    : [
        [1, -1],
        [1, 0],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [0, -1],
      ];

  interface Cell {
    q: number;
    r: number;
    cx: number;
    cy: number;
    heightLevel: number;
  }
  const cellMap = new Map<string, Cell>();
  const rawCells: Cell[] = [];
  const projValues: number[] = [];

  for (let q = -d; q <= d; q++) {
    const rMin = Math.max(-d, -q - d);
    const rMax = Math.min(d, -q + d);
    for (let r = rMin; r <= rMax; r++) {
      const { x, y } = cubeToPixel(q, r);
      let proj: number;
      switch (slopeDir) {
        case SlopeDirection.TOP:
          proj = -y;
          break;
        case SlopeDirection.BOTTOM:
          proj = y;
          break;
        case SlopeDirection.LEFT:
          proj = -x;
          break;
        case SlopeDirection.RIGHT:
          proj = x;
          break;
        default:
          proj = 0;
      }
      projValues.push(Math.round(proj * 1000));
      const cell: Cell = { q, r, cx: x, cy: y, heightLevel: 0 };
      rawCells.push(cell);
      cellMap.set(`${q},${r}`, cell);
    }
  }

  if (rawCells.length <= 1) return { floors: [], walls: [] };

  const uniqueProjs = [...new Set(projValues)].sort((a, b) => b - a);
  const numSteps = uniqueProjs.length;
  const projToLevel = new Map<number, number>();
  uniqueProjs.forEach((p, i) => projToLevel.set(p, i));
  for (let i = 0; i < rawCells.length; i++) {
    rawCells[i].heightLevel = projToLevel.get(projValues[i])!;
  }

  const cellHeight = (level: number) => (totalHeightPx * (numSteps - level)) / numSteps;

  const floors: HexSlopeStepFloor[] = [];
  const maskS = s + 0.5;
  for (let level = 0; level < numSteps; level++) {
    const levelCells = rawCells.filter((c) => c.heightLevel === level);
    const heightPx = cellHeight(level);
    const polygons: string[] = [];
    for (const cell of levelCells) {
      const svgCx = cell.cx - bbox.minX;
      const svgCy = cell.cy - bbox.minY;
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = startAngle + (i * Math.PI) / 3;
        pts.push(`${svgCx + maskS * Math.cos(angle)},${svgCy + maskS * Math.sin(angle)}`);
      }
      polygons.push(`<polygon points="${pts.join(' ')}"/>`);
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bboxW}" height="${bboxH}">` +
      `<g fill="#000">${polygons.join('')}</g></svg>`;
    const mask = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}") 0px 0px / ${bboxW}px ${bboxH}px no-repeat`;
    floors.push({ heightPx, mask });
  }

  const walls: HexSlopeStepWall[] = [];
  const hexVertex = (cx: number, cy: number, i: number) => {
    const angle = startAngle + (i * Math.PI) / 3;
    return { x: cx + s * Math.cos(angle), y: cy + s * Math.sin(angle) };
  };

  for (const cell of rawCells) {
    const cellH = cellHeight(cell.heightLevel);
    for (let e = 0; e < 6; e++) {
      const [dq, dr] = neighborDirs[e];
      const neighbor = cellMap.get(`${cell.q + dq},${cell.r + dr}`);

      let wallHeightPx: number;
      let basePx: number;
      if (!neighbor) {
        wallHeightPx = cellH;
        basePx = 0;
      } else if (neighbor.heightLevel > cell.heightLevel) {
        const neighborH = cellHeight(neighbor.heightLevel);
        wallHeightPx = cellH - neighborH;
        basePx = neighborH;
      } else {
        continue;
      }
      if (wallHeightPx < 0.5) continue;

      const v1 = hexVertex(cell.cx, cell.cy, e);
      const v2 = hexVertex(cell.cx, cell.cy, (e + 1) % 6);
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const edgeLength = Math.sqrt(dx * dx + dy * dy);
      const edgeAngle = Math.atan2(dy, dx);

      const brightness = useSurfaceShading
        ? Math.max(0.3, Math.min(1.0, 0.65 - 0.35 * Math.cos(edgeAngle) + 0.15 * Math.sin(edgeAngle)))
        : 1.0;

      walls.push({
        edgeLength: edgeLength + 1,
        px: containerW / 2 + v2.x,
        py: containerH / 2 + v2.y,
        angle: edgeAngle + Math.PI,
        brightness,
        wallHeightPx,
        basePx,
      });
    }
  }

  return { floors, walls };
}
