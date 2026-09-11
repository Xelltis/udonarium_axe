import { hexCircumradius, hexStartAngle } from '@axe/domain/tabletop/hex-geometry';

export interface HexFlowerParams {
  outline: Point[];
  bbox: BoundingBox;
  L: number;
  g: number;
}

interface Point {
  x: number;
  y: number;
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function buildHexFlowerOutline(size: number, gridSize: number, isFlatTop: boolean): Point[] {
  const s = hexCircumradius(gridSize);
  const g = gridSize;
  const d = size - 1;

  const cells = new Set<string>();
  for (let q = -d; q <= d; q++) {
    const rMin = Math.max(-d, -q - d);
    const rMax = Math.min(d, -q + d);
    for (let r = rMin; r <= rMax; r++) {
      cells.add(`${q},${r}`);
    }
  }

  const cubeToPixel = (q: number, r: number): Point => {
    if (isFlatTop) {
      return { x: 1.5 * s * q, y: (g / 2) * q + g * r };
    } else {
      return { x: g * q + (g / 2) * r, y: 1.5 * s * r };
    }
  };

  const neighborDirs: number[][] = isFlatTop
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

  const startAngle = hexStartAngle(isFlatTop);
  const hexVertex = (cx: number, cy: number, i: number): Point => {
    const angle = startAngle + (i * Math.PI) / 3;
    return { x: cx + s * Math.cos(angle), y: cy + s * Math.sin(angle) };
  };

  type Segment = { from: Point; to: Point };
  const segments: Segment[] = [];
  const fromMap = new Map<string, number>();
  const vtxKey = (p: Point): string => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

  for (const key of cells) {
    const [q, r] = key.split(',').map(Number);
    const { x: cx, y: cy } = cubeToPixel(q, r);
    for (let e = 0; e < 6; e++) {
      const [dq, dr] = neighborDirs[e];
      if (!cells.has(`${q + dq},${r + dr}`)) {
        const from = hexVertex(cx, cy, e);
        const to = hexVertex(cx, cy, (e + 1) % 6);
        const idx = segments.length;
        segments.push({ from, to });
        fromMap.set(vtxKey(from), idx);
      }
    }
  }

  const path: Point[] = [];
  const visited = new Array(segments.length).fill(false);
  let current = 0;
  for (let i = 0; i < segments.length; i++) {
    visited[current] = true;
    path.push(segments[current].from);
    const next = fromMap.get(vtxKey(segments[current].to));
    if (next === undefined || visited[next]) break;
    current = next;
  }

  return path;
}

export function insetPolygon(vertices: Point[], bw: number): Point[] {
  const n = vertices.length;
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const l1 = Math.sqrt(d1x * d1x + d1y * d1y);
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l2 = Math.sqrt(d2x * d2x + d2y * d2y);
    const n1x = -d1y / l1;
    const n1y = d1x / l1;
    const n2x = -d2y / l2;
    const n2y = d2x / l2;
    const bx = n1x + n2x;
    const by = n1y + n2y;
    const dot = n1x * bx + n1y * by; // = 1 + cos(angle between normals)
    if (Math.abs(dot) < 1e-10) {
      result.push({ x: curr.x + n1x * bw, y: curr.y + n1y * bw });
    } else {
      const k = bw / dot;
      result.push({ x: curr.x + bx * k, y: curr.y + by * k });
    }
  }
  return result;
}

export function buildHexRingClipPath(outline: Point[], bbox: BoundingBox, borderWidth: number): string {
  const outer = outline.map((v) => ({ x: v.x - bbox.minX, y: v.y - bbox.minY }));
  const inner = insetPolygon(outer, borderWidth);
  const f = (v: number): string => v.toFixed(2);

  let outerPath = `M ${f(outer[0].x)} ${f(outer[0].y)}`;
  for (let i = 1; i < outer.length; i++) {
    outerPath += ` L ${f(outer[i].x)} ${f(outer[i].y)}`;
  }
  outerPath += ' Z';

  let innerPath = `M ${f(inner[0].x)} ${f(inner[0].y)}`;
  for (let i = 1; i < inner.length; i++) {
    innerPath += ` L ${f(inner[i].x)} ${f(inner[i].y)}`;
  }
  innerPath += ' Z';

  return `path(evenodd, "${outerPath} ${innerPath}")`;
}

export function calcHexFlowerParams(size: number, gridSize: number, isFlatTop: boolean): HexFlowerParams {
  const L = size * gridSize;
  const outline =
    size % 1 !== 0
      ? buildVertexClusterOutline(size, gridSize, isFlatTop)
      : buildHexFlowerOutline(Math.min(Math.max(Math.round(size), 1), 6), gridSize, isFlatTop);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of outline) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { outline, bbox: { minX, minY, maxX, maxY }, L, g: gridSize };
}

export function buildVertexClusterOutline(size: number, gridSize: number, isFlatTop: boolean): Point[] {
  const s = hexCircumradius(gridSize);
  const g = gridSize;
  const startAngle = hexStartAngle(isFlatTop);

  const tierCount = Math.max(1, Math.floor(size));

  const cubeToPixel = (q: number, r: number): Point =>
    isFlatTop ? { x: 1.5 * s * q, y: (g / 2) * q + g * r } : { x: g * q + (g / 2) * r, y: 1.5 * s * r };

  const vertexPos: Point = isFlatTop ? { x: s, y: 0 } : { x: 0, y: -s };

  const maxRange = tierCount + 2;
  const candidates: { q: number; r: number; ndist: number }[] = [];
  const s2 = s * s;
  for (let q = -maxRange; q <= maxRange + 1; q++) {
    for (let r = -maxRange; r <= maxRange + 1; r++) {
      const { x, y } = cubeToPixel(q, r);
      const dx = x - vertexPos.x;
      const dy = y - vertexPos.y;
      candidates.push({ q, r, ndist: Math.round((dx * dx + dy * dy) / s2) });
    }
  }
  candidates.sort((a, b) => a.ndist - b.ndist);

  const cubes: [number, number][] = [];
  let tiersFound = 0;
  let prevNdist = -1;
  for (const c of candidates) {
    if (c.ndist !== prevNdist) {
      tiersFound++;
      if (tiersFound > tierCount) break;
      prevNdist = c.ndist;
    }
    cubes.push([c.q, c.r]);
  }

  const cells = new Set(cubes.map(([q, r]) => `${q},${r}`));

  const neighborDirs: number[][] = isFlatTop
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

  const hexVertex = (cx: number, cy: number, i: number): Point => {
    const angle = startAngle + (i * Math.PI) / 3;
    return { x: cx + s * Math.cos(angle), y: cy + s * Math.sin(angle) };
  };

  type Segment = { from: Point; to: Point };
  const segments: Segment[] = [];
  const fromMap = new Map<string, number>();
  const vtxKey = (p: Point): string => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

  for (const [q, r] of cubes) {
    const { x: px, y: py } = cubeToPixel(q, r);
    const cx = px - vertexPos.x;
    const cy = py - vertexPos.y;
    for (let e = 0; e < 6; e++) {
      const [dq, dr] = neighborDirs[e];
      if (!cells.has(`${q + dq},${r + dr}`)) {
        const from = hexVertex(cx, cy, e);
        const to = hexVertex(cx, cy, (e + 1) % 6);
        const idx = segments.length;
        segments.push({ from, to });
        fromMap.set(vtxKey(from), idx);
      }
    }
  }

  const path: Point[] = [];
  const visited = new Array(segments.length).fill(false);
  let current = 0;
  for (let i = 0; i < segments.length; i++) {
    visited[current] = true;
    path.push(segments[current].from);
    const next = fromMap.get(vtxKey(segments[current].to));
    if (next === undefined || visited[next]) break;
    current = next;
  }

  return path;
}
