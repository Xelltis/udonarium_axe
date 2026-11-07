import { catmullRomSegments } from '@axe/domain/map-editor/curve-geometry';
import { functionInkOf } from '@axe/domain/map-editor/function-layer';
import { cellCenter, pointToCell } from '@axe/domain/map-editor/grid-cells';
import { objectPlacementsOf } from '@axe/domain/map-editor/object-placements';
import { reliefChunksOf } from '@axe/domain/map-editor/relief';
import {
  FillStyle,
  FreehandStroke,
  FunctionLayer,
  ImageItem,
  MapScene,
  parseCellKey,
  ReliefLayer,
  sceneHeightPx,
  sceneWidthPx,
  ShapeItem,
  ShapeShadow,
  StampItem,
  StrokeDash,
  StrokeStyle,
  TextItem,
} from '@axe/domain/map-editor/scene';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import {
  GROUND_CHUNK_SAMPLES,
  GROUND_HEIGHT_STEP,
  GROUND_PAINT_FULL,
  GROUND_SAMPLES_PER_CELL,
} from '@axe/domain/tabletop/ground/ground-chunk-data';
import {
  fillHexPath,
  hexCircumradius,
  hexStartAngle,
  isFlatTopGrid,
  isHexGrid,
  strokeHexPath,
  traceHexPath,
} from '@axe/domain/tabletop/hex-geometry';
export interface RenderHelpers {
  texturePattern(
    fill: { textureId: string; scale: number; rotation: number },
    cellPx: number
  ): CanvasPattern | string | null;
  stampImage(item: StampItem): CanvasImageSource | null;
  rasterImage?(item: ImageItem): CanvasImageSource | null;
  /** A bundled model seen from straight above, as wide and deep as it stands, or null where there is none to hand. */
  modelTop?(model: string): CanvasImageSource | null;
}

export interface RenderOptions {
  drawGrid?: boolean;
  hideTextId?: string;
  /**
   * Whether the cells painted for what they do are drawn.
   *
   * Off unless asked, so a map exported without a thought about it comes out as the picture
   * alone rather than with the workings hatched across it.
   */
  drawFunctionLayers?: boolean;
}

function resolveFill(fill: FillStyle, helpers: RenderHelpers, cellPx: number): string | CanvasPattern | null {
  if (fill.type === 'solid') return fill.color;
  return helpers.texturePattern({ textureId: fill.textureId, scale: fill.scale, rotation: fill.rotation }, cellPx);
}

function dashPattern(dash: StrokeDash, width: number): number[] {
  const w = width > 0 ? width : 1;
  switch (dash) {
    case 'dashed':
      return [w * 3, w * 2];
    case 'dotted':
      return [w, w * 2];
    case 'dashdot':
      return [w * 4, w * 2, w, w * 2];
    case 'longdash':
      return [w * 6, w * 3];
    default:
      return [];
  }
}

function applyStroke(ctx: CanvasRenderingContext2D, stroke: StrokeStyle): void {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  const dash = stroke.dash;
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash(dash ? dashPattern(dash, stroke.width) : []);
  }
  ctx.lineCap = stroke.dash === 'dotted' ? 'round' : 'butt';
}

function resetLineDash(ctx: CanvasRenderingContext2D): void {
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
}

function applyShadow(ctx: CanvasRenderingContext2D, shadow: ShapeShadow): void {
  ctx.shadowColor = shadow.color;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetX = shadow.offsetX;
  ctx.shadowOffsetY = shadow.offsetY;
}

function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function bboxCenter(item: ShapeItem): { cx: number; cy: number } {
  const p = item.points;
  if (item.shape === 'rect' || item.shape === 'ellipse') {
    return { cx: (p[0] ?? 0) + (p[2] ?? 0) / 2, cy: (p[1] ?? 0) + (p[3] ?? 0) / 2 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) {
    const x = p[i];
    const y = p[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { cx: 0, cy: 0 };
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function pathShape(ctx: CanvasRenderingContext2D, item: ShapeItem): void {
  const p = item.points;
  if (item.shape === 'rect') {
    ctx.beginPath();
    ctx.rect(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0);
    return;
  }
  if (item.shape === 'ellipse') {
    const w = p[2] ?? 0;
    const h = p[3] ?? 0;
    ctx.beginPath();
    ctx.ellipse((p[0] ?? 0) + w / 2, (p[1] ?? 0) + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    return;
  }
  if (item.shape === 'curve' || item.shape === 'closedCurve') {
    ctx.beginPath();
    if (p.length >= 2) {
      ctx.moveTo(p[0], p[1]);
      for (const seg of catmullRomSegments(p, item.shape === 'closedCurve')) {
        ctx.bezierCurveTo(seg.c1x, seg.c1y, seg.c2x, seg.c2y, seg.x, seg.y);
      }
      if (item.shape === 'closedCurve') ctx.closePath();
    }
    return;
  }
  ctx.beginPath();
  if (p.length >= 2) {
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i + 1 < p.length; i += 2) {
      ctx.lineTo(p[i], p[i + 1]);
    }
    if (item.shape === 'polygon') ctx.closePath();
  }
}

function drawShapeItem(ctx: CanvasRenderingContext2D, item: ShapeItem, helpers: RenderHelpers, cellPx: number): void {
  const { cx, cy } = bboxCenter(item);
  ctx.save();
  if (item.rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((item.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (item.shadow) applyShadow(ctx, item.shadow);
  pathShape(ctx, item);
  const fillable = item.shape !== 'line' && item.shape !== 'polyline' && item.shape !== 'curve';
  if (item.fill && fillable) {
    const fill = resolveFill(item.fill, helpers, cellPx);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }
  if (item.stroke) {
    applyStroke(ctx, item.stroke);
    if (item.stroke.fill) {
      const strokeFill = resolveFill(item.stroke.fill, helpers, cellPx);
      ctx.strokeStyle = strokeFill ?? item.stroke.color;
    }
    ctx.lineJoin = 'round';
    if (!item.stroke.dash) ctx.lineCap = 'round';
    ctx.stroke();
    resetLineDash(ctx);
  }
  if (item.shadow) clearShadow(ctx);
  ctx.restore();
}

function drawStamp(ctx: CanvasRenderingContext2D, item: StampItem, helpers: RenderHelpers): void {
  const image = helpers.stampImage(item);
  if (!image) return;
  ctx.save();
  ctx.translate(item.x, item.y);
  if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);
  ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
  const { w, h } = fitStampBox(image, item.size);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function fitStampBox(image: CanvasImageSource, size: number): { w: number; h: number } {
  const iw =
    (image as { naturalWidth?: number; width?: number }).naturalWidth || (image as { width?: number }).width || 0;
  const ih =
    (image as { naturalHeight?: number; height?: number }).naturalHeight || (image as { height?: number }).height || 0;
  if (!iw || !ih) return { w: size, h: size };
  const scale = Math.min(size / iw, size / ih);
  return { w: iw * scale, h: ih * scale };
}

function clipCellPath(
  ctx: CanvasRenderingContext2D,
  scene: MapScene,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): void {
  const hex = isHexGrid(scene.gridType);
  const s = hex ? hexCircumradius(scene.cellPx) : 0;
  const startAngle = hex ? hexStartAngle(isFlatTopGrid(scene.gridType)) : 0;
  const a = pointToCell(scene.gridType, minX, minY, scene.cellPx);
  const b = pointToCell(scene.gridType, maxX, maxY, scene.cellPx);
  const c0 = Math.min(a.col, b.col) - 1;
  const c1 = Math.max(a.col, b.col) + 1;
  const r0 = Math.min(a.row, b.row) - 1;
  const r1 = Math.max(a.row, b.row) + 1;
  ctx.beginPath();
  for (let col = c0; col <= c1; col += 1) {
    for (let row = r0; row <= r1; row += 1) {
      const { x, y } = cellCenter(scene.gridType, col, row, scene.cellPx);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (hex) {
        traceHexPath(ctx, x, y, s, startAngle);
      } else {
        ctx.rect(col * scene.cellPx, row * scene.cellPx, scene.cellPx, scene.cellPx);
      }
    }
  }
  ctx.clip();
}

function drawImageItem(
  ctx: CanvasRenderingContext2D,
  item: ImageItem,
  helpers: RenderHelpers,
  layerAlpha: number,
  scene: MapScene
): void {
  const image = helpers.rasterImage?.(item);
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = layerAlpha * (Number.isFinite(item.opacity) ? Math.max(0, Math.min(1, item.opacity)) : 1);
  if (item.clipToCells) {
    const minX = item.x - item.w / 2;
    const minY = item.y - item.h / 2;
    clipCellPath(ctx, scene, minX, minY, minX + item.w, minY + item.h);
    ctx.drawImage(image, minX, minY, item.w, item.h);
    ctx.restore();
    return;
  }
  ctx.translate(item.x, item.y);
  if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);
  if (item.flipX || item.flipY) ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
  const cut = item.crop;
  if (cut && cut.w > 0 && cut.h > 0) {
    ctx.drawImage(image, cut.x, cut.y, cut.w, cut.h, -item.w / 2, -item.h / 2, item.w, item.h);
  } else {
    ctx.drawImage(image, -item.w / 2, -item.h / 2, item.w, item.h);
  }
  ctx.restore();
}

function drawFreehandStroke(ctx: CanvasRenderingContext2D, stroke: FreehandStroke): void {
  const p = stroke.points;
  if (p.length < 2) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 4) {
    ctx.lineTo(p[2], p[3]);
  } else {
    for (let i = 2; i + 3 < p.length; i += 2) {
      const midX = (p[i] + p[i + 2]) / 2;
      const midY = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], midX, midY);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, item: TextItem): void {
  ctx.save();
  const parts: string[] = [];
  if (item.italic) parts.push('italic');
  if (item.bold) parts.push('bold');
  parts.push(`${item.fontSize}px`, 'sans-serif');
  ctx.font = parts.join(' ');
  const lines = item.text.split('\n');
  const lineHeight = item.fontSize * 1.2;

  if (item.background) {
    // A card behind the words, cornered and shadowed, which is what reads as a note.
    const pad = item.fontSize * 0.5;
    const widest = lines.reduce((most, line) => Math.max(most, ctx.measureText(line).width), 0);
    ctx.fillStyle = item.background;
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = pad * 0.8;
    ctx.shadowOffsetY = pad * 0.25;
    // Where the words start depends on which way they are set, so the card follows them: laid
    // out from the left it would sit off to one side of centred or right-hand words.
    const left = item.align === 'center' ? item.x - widest / 2 : item.align === 'right' ? item.x - widest : item.x;
    ctx.fillRect(left - pad, item.y - pad, widest + pad * 2, lines.length * lineHeight + pad * 2);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.textAlign = item.align;
  ctx.textBaseline = 'top';
  if (item.shadow) applyShadow(ctx, item.shadow);

  const outline = item.outline && item.outline.width > 0 ? item.outline : null;
  if (outline) {
    // Struck round the letters before they are filled, so the line sits behind the colour and
    // the letters keep their own shape rather than being thinned by it.
    ctx.strokeStyle = outline.color;
    ctx.lineWidth = outline.width * 2;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    for (let i = 0; i < lines.length; i += 1) {
      ctx.strokeText(lines[i], item.x, item.y + i * lineHeight);
    }
  }

  ctx.fillStyle = item.color;
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i], item.x, item.y + i * lineHeight);
  }
  if (item.shadow) clearShadow(ctx);

  if (item.underline || item.strike) {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = Math.max(1, item.fontSize / 14);
    for (let i = 0; i < lines.length; i += 1) {
      const width = ctx.measureText(lines[i]).width;
      const left = item.align === 'center' ? item.x - width / 2 : item.align === 'right' ? item.x - width : item.x;
      const top = item.y + i * lineHeight;
      if (item.underline) ruleUnder(ctx, left, top + item.fontSize * 1.02, width);
      if (item.strike) ruleUnder(ctx, left, top + item.fontSize * 0.58, width);
    }
  }
  ctx.restore();
}

function ruleUnder(ctx: CanvasRenderingContext2D, left: number, at: number, width: number): void {
  ctx.beginPath();
  ctx.moveTo(left, at);
  ctx.lineTo(left + width, at);
  ctx.stroke();
}

function drawHexGridLines(ctx: CanvasRenderingContext2D, scene: MapScene): void {
  ctx.save();
  ctx.strokeStyle = scene.gridColor;
  ctx.lineWidth = 1;
  const s = hexCircumradius(scene.cellPx);
  const startAngle = hexStartAngle(isFlatTopGrid(scene.gridType));
  for (let col = 0; col < scene.cols; col += 1) {
    for (let row = 0; row < scene.rows; row += 1) {
      const { x, y } = cellCenter(scene.gridType, col, row, scene.cellPx);
      strokeHexPath(ctx, x, y, s, startAngle);
    }
  }
  ctx.restore();
}

function drawGridLines(ctx: CanvasRenderingContext2D, scene: MapScene, width: number, height: number): void {
  if (isHexGrid(scene.gridType)) {
    drawHexGridLines(ctx, scene);
    return;
  }
  if (scene.gridType === GridType.NONE) return;
  ctx.save();
  ctx.strokeStyle = scene.gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= scene.cols; c += 1) {
    const x = c * scene.cellPx + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let r = 0; r <= scene.rows; r += 1) {
    const y = r * scene.cellPx + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.restore();
}

/**
 * Draws the map onto the canvas: its background, then each visible layer in order at its own
 * opacity, then the grid.
 *
 * The cells painted for what they do are drawn only when asked for, and the grid follows the
 * scene's own setting unless the options say otherwise. A text being edited in place can be left
 * out.
 */
/** How high ground has to stand for its tint to be at its deepest, in cells. */
const RELIEF_FULL_CELLS = 4;
/** The colour each kind of ground is painted in on the editor's map, in the order of `GROUND_PAINT_LAYERS`. */
const RELIEF_PAINT_COLOURS: readonly (readonly [number, number, number])[] = [
  [92, 138, 59],
  [122, 89, 59],
  [128, 128, 128],
  [217, 194, 140],
];
/** How much of the map the fullest paint covers, so what lies under it still shows. */
const RELIEF_PAINT_COVER = 0.7;
const RELIEF_RAISED = '140, 92, 44';
const RELIEF_SUNK = '44, 96, 168';
const RELIEF_CONTOUR = 'rgba(60, 36, 16, 0.75)';

/**
 * Draws the paint of a chunk of relief: a square round every painted sample in the colours of the
 * kinds of ground it is painted with, mixed in their shares.
 */
function drawReliefPaint(
  ctx: CanvasRenderingContext2D,
  paint: Uint8Array,
  left: number,
  top: number,
  step: number
): void {
  const kinds = RELIEF_PAINT_COLOURS.length;
  for (let j = 0; j < GROUND_CHUNK_SAMPLES; j++) {
    for (let i = 0; i < GROUND_CHUNK_SAMPLES; i++) {
      const shares = paint.subarray((j * GROUND_CHUNK_SAMPLES + i) * kinds, (j * GROUND_CHUNK_SAMPLES + i + 1) * kinds);
      const total = shares.reduce((sum, share) => sum + share, 0);
      if (total <= 0) continue;
      const colour = [0, 1, 2].map((channel) =>
        Math.round(shares.reduce((sum, share, kind) => sum + RELIEF_PAINT_COLOURS[kind][channel] * share, 0) / total)
      );
      const cover = (Math.min(total, GROUND_PAINT_FULL) / GROUND_PAINT_FULL) * RELIEF_PAINT_COVER;
      ctx.fillStyle = `rgba(${colour.join(', ')}, ${cover})`;
      ctx.fillRect((left + i - 0.5) * step, (top + j - 0.5) * step, step, step);
    }
  }
}

/**
 * Draws a relief layer as a map of heights over the paint it lays: a square round every sample,
 * tinted brown the higher it stands and blue the deeper it is dug, and a line wherever the ground
 * crosses a whole cell of height between one sample and the next.
 */
function drawReliefLayer(ctx: CanvasRenderingContext2D, layer: ReliefLayer, cellPx: number): void {
  const step = cellPx / GROUND_SAMPLES_PER_CELL;
  for (const chunk of reliefChunksOf(layer)) {
    const left = chunk.cx * GROUND_CHUNK_SAMPLES;
    const top = chunk.cy * GROUND_CHUNK_SAMPLES;
    if (chunk.paint) drawReliefPaint(ctx, chunk.paint, left, top, step);
    const cells = (i: number, j: number) => chunk.heights[j * GROUND_CHUNK_SAMPLES + i] * GROUND_HEIGHT_STEP;
    for (let j = 0; j < GROUND_CHUNK_SAMPLES; j++) {
      for (let i = 0; i < GROUND_CHUNK_SAMPLES; i++) {
        const height = cells(i, j);
        if (height === 0) continue;
        const depth = Math.min(1, Math.abs(height) / RELIEF_FULL_CELLS);
        ctx.fillStyle = `rgba(${height > 0 ? RELIEF_RAISED : RELIEF_SUNK}, ${0.15 + 0.55 * depth})`;
        ctx.fillRect((left + i - 0.5) * step, (top + j - 0.5) * step, step, step);
      }
    }
    ctx.strokeStyle = RELIEF_CONTOUR;
    ctx.lineWidth = Math.max(1, cellPx / 32);
    ctx.beginPath();
    for (let j = 0; j < GROUND_CHUNK_SAMPLES; j++) {
      for (let i = 0; i < GROUND_CHUNK_SAMPLES; i++) {
        const level = Math.floor(cells(i, j));
        if (i + 1 < GROUND_CHUNK_SAMPLES && Math.floor(cells(i + 1, j)) !== level) {
          ctx.moveTo((left + i + 0.5) * step, (top + j - 0.5) * step);
          ctx.lineTo((left + i + 0.5) * step, (top + j + 0.5) * step);
        }
        if (j + 1 < GROUND_CHUNK_SAMPLES && Math.floor(cells(i, j + 1)) !== level) {
          ctx.moveTo((left + i - 0.5) * step, (top + j + 0.5) * step);
          ctx.lineTo((left + i + 0.5) * step, (top + j + 0.5) * step);
        }
      }
    }
    ctx.stroke();
  }
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: MapScene,
  helpers: RenderHelpers,
  options?: RenderOptions
): void {
  if (!ctx) return;
  const width = sceneWidthPx(scene);
  const height = sceneHeightPx(scene);

  ctx.clearRect(0, 0, width, height);
  if (scene.background !== 'transparent') {
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, width, height);
  }

  for (const layer of scene.layers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    switch (layer.kind) {
      case 'cell': {
        const hex = isHexGrid(scene.gridType);
        const s = hex ? hexCircumradius(scene.cellPx) : 0;
        const startAngle = hex ? hexStartAngle(isFlatTopGrid(scene.gridType)) : 0;
        for (const [key, fill] of Object.entries(layer.cells)) {
          const resolved = resolveFill(fill, helpers, scene.cellPx);
          if (!resolved) continue;
          const { col, row } = parseCellKey(key);
          ctx.fillStyle = resolved;
          if (hex) {
            const { x, y } = cellCenter(scene.gridType, col, row, scene.cellPx);
            fillHexPath(ctx, x, y, s, startAngle);
          } else {
            ctx.fillRect(col * scene.cellPx, row * scene.cellPx, scene.cellPx, scene.cellPx);
          }
        }
        break;
      }
      case 'shape':
        for (const item of layer.items) drawShapeItem(ctx, item, helpers, scene.cellPx);
        break;
      case 'stamp':
        for (const item of layer.items) drawStamp(ctx, item, helpers);
        break;
      case 'freehand':
        for (const stroke of layer.strokes) drawFreehandStroke(ctx, stroke);
        break;
      case 'text':
        for (const item of layer.items) {
          if (item.id === options?.hideTextId) continue;
          drawText(ctx, item);
        }
        break;
      case 'image':
        for (const item of layer.items) drawImageItem(ctx, item, helpers, layer.opacity, scene);
        break;
      case 'relief':
        if (options?.drawFunctionLayers) drawReliefLayer(ctx, layer, scene.cellPx);
        break;
      case 'function': {
        if (!options?.drawFunctionLayers) break;
        const hex = isHexGrid(scene.gridType);
        const s = hex ? hexCircumradius(scene.cellPx) : 0;
        const startAngle = hex ? hexStartAngle(isFlatTopGrid(scene.gridType)) : 0;
        ctx.fillStyle = functionInkOf(layer.role, layer.spec);
        for (const key of Object.keys(layer.cells)) {
          const { col, row } = parseCellKey(key);
          if (hex) {
            const { x, y } = cellCenter(scene.gridType, col, row, scene.cellPx);
            fillHexPath(ctx, x, y, s, startAngle);
          } else {
            ctx.fillRect(col * scene.cellPx, row * scene.cellPx, scene.cellPx, scene.cellPx);
          }
        }
        if (layer.role === 'object') drawObjectPlacements(ctx, layer, scene, helpers);
        break;
      }
    }
  }

  ctx.globalAlpha = 1;

  if (options?.drawGrid ?? scene.gridVisible) {
    drawGridLines(ctx, scene, width, height);
  }
}

/** What the boxes the 3D objects of a layer stand in are outlined in while the layer is worked on. */
const OBJECT_OUTLINE = 'rgba(20, 90, 75, 0.9)';

/**
 * Draws each 3D object a layer sets out where it comes to stand, as its box would stand on the table:
 * a bundled model as it is seen from straight above, and one held in the room, which has no such
 * picture, as the outline of its box with its name in the middle. The cells say where the brush
 * went, and these what comes to stand there.
 */
function drawObjectPlacements(
  ctx: CanvasRenderingContext2D,
  layer: FunctionLayer,
  scene: MapScene,
  helpers: RenderHelpers
): void {
  const grid = cellGridOf(scene.cols, scene.rows, scene.cellPx, scene.gridType);
  const spec = layer.spec.object;
  const top = helpers.modelTop?.(spec.model) ?? null;
  ctx.save();
  ctx.strokeStyle = OBJECT_OUTLINE;
  ctx.fillStyle = OBJECT_OUTLINE;
  ctx.lineWidth = Math.max(1, scene.cellPx / 40);
  ctx.font = `${Math.max(8, Math.round(scene.cellPx / 5))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const placed of objectPlacementsOf(Object.keys(layer.cells), spec, grid)) {
    const width = placed.width * scene.cellPx;
    const depth = placed.depth * scene.cellPx;
    ctx.save();
    ctx.translate(placed.x + width / 2, placed.y + depth / 2);
    ctx.rotate((placed.rotate * Math.PI) / 180);
    if (top) {
      ctx.drawImage(top, -width / 2, -depth / 2, width, depth);
    } else {
      ctx.strokeRect(-width / 2, -depth / 2, width, depth);
      if (spec.name) ctx.fillText(spec.name, 0, 0, Math.max(width, scene.cellPx) * 0.9);
    }
    ctx.restore();
  }
  ctx.restore();
}
