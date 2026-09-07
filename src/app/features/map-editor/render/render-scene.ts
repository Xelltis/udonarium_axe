import { GridType } from '@axe/domain/tabletop/game-table';
import { hexCircumradius, hexStartAngle, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { catmullRomSegments } from '@axe/features/map-editor/model/curve-geometry';
import { FUNCTION_ROLE_INK } from '@axe/features/map-editor/model/function-layer';
import { cellCenter, pointToCell } from '@axe/features/map-editor/model/grid-cells';
import {
  FillStyle,
  FreehandStroke,
  ImageItem,
  MapScene,
  parseCellKey,
  sceneHeightPx,
  sceneWidthPx,
  ShapeItem,
  ShapeShadow,
  StampItem,
  StrokeDash,
  StrokeStyle,
  TextItem,
} from '@axe/features/map-editor/model/scene';
export interface RenderHelpers {
  texturePattern(
    fill: { textureId: string; scale: number; rotation: number },
    cellPx: number
  ): CanvasPattern | string | null;
  stampImage(item: StampItem): CanvasImageSource | null;
  rasterImage?(item: ImageItem): CanvasImageSource | null;
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
        for (let i = 0; i < 6; i += 1) {
          const angle = startAngle + (i * Math.PI) / 3;
          const px = x + s * Math.cos(angle);
          const py = y + s * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
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

function fillHexCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, startAngle: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = startAngle + (i * Math.PI) / 3;
    const x = cx + s * Math.cos(angle);
    const y = cy + s * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function strokeHexCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, startAngle: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = startAngle + (i * Math.PI) / 3;
    const x = cx + s * Math.cos(angle);
    const y = cy + s * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
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
    // out from the left it sat off to one side of centred or right-hand words.
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
      strokeHexCell(ctx, x, y, s, startAngle);
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
            fillHexCell(ctx, x, y, s, startAngle);
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
      case 'function': {
        if (!options?.drawFunctionLayers) break;
        const hex = isHexGrid(scene.gridType);
        const s = hex ? hexCircumradius(scene.cellPx) : 0;
        const startAngle = hex ? hexStartAngle(isFlatTopGrid(scene.gridType)) : 0;
        ctx.fillStyle = FUNCTION_ROLE_INK[layer.role];
        for (const key of Object.keys(layer.cells)) {
          const { col, row } = parseCellKey(key);
          if (hex) {
            const { x, y } = cellCenter(scene.gridType, col, row, scene.cellPx);
            fillHexCell(ctx, x, y, s, startAngle);
          } else {
            ctx.fillRect(col * scene.cellPx, row * scene.cellPx, scene.cellPx, scene.cellPx);
          }
        }
        break;
      }
    }
  }

  ctx.globalAlpha = 1;

  if (options?.drawGrid ?? scene.gridVisible) {
    drawGridLines(ctx, scene, width, height);
  }
}
