import { GridType } from '@axe/domain/tabletop/game-table';
import { catmullRomSegments } from '@axe/features/map-editor/model/curve-geometry';
import { imageCorners } from '@axe/features/map-editor/model/editor-hit-test';
import type { EditorTool, LineKind, ShapeGeneratorKind } from '@axe/features/map-editor/model/editor-tool';
import { cellCenter, pointToCell } from '@axe/features/map-editor/model/grid-cells';
import type { ImageItem, MapScene, ShapeItem } from '@axe/features/map-editor/model/scene';
import { shapeBox, strokeBox, textBox } from '@axe/features/map-editor/model/scene-geometry';
import { generateShapePoints } from '@axe/features/map-editor/model/shape-points';

/**
 * What is being drawn, and the handles on whatever is held.
 *
 * The finished picture is drawn elsewhere; this draws only what is **not settled yet**.
 *
 * Nothing that waits, such as loading an image, happens here; it arrives ready to draw
 * (starting a load from inside the drawing would run it on every frame).
 */

export interface OverlayPoint {
  x: number;
  y: number;
}

/** The image shown before it is placed. The caller loads it. */
export interface OverlayStamp {
  image: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  size: number;
  center: OverlayPoint;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface OverlayImage {
  image: CanvasImageSource;
  at: OverlayPoint;
  size: { w: number; h: number };
}

export interface EditorOverlay {
  tool: EditorTool;
  lineKind: LineKind;
  shapeKind: ShapeGeneratorKind;
  multiClickLine: boolean;
  /** Where the pointer was last. Null once it has left. */
  hover: OverlayPoint | null;
  panning: boolean;
  vectorErase: boolean;
  eraserSize: number;
  draftStart: OverlayPoint | null;
  draftCurrent: OverlayPoint | null;
  draftPoints: number[];
  freehandPoints: number[];
  selection: { layerId: string; itemId: string } | null;
  selectedImage: ImageItem | null;
  selectedCurve: ShapeItem | null;
  stamp: OverlayStamp | null;
  image: OverlayImage | null;
  /** How a measurement reads. It follows the interface language, so the caller supplies the words. */
  measureLabel: { cells: (n: string) => string; angle: (deg: number) => string };
}

/**
 * Draws what is still being worked on over the finished map.
 *
 * That is the cell or eraser under the pointer, the shape, line or freehand stroke still being
 * drawn, the stamp or picture about to be placed, and the outline and handles of what is selected.
 */
export function renderOverlay(ctx: CanvasRenderingContext2D, scene: MapScene, overlay: EditorOverlay): void {
  const tool = overlay.tool;
  ctx.save();
  ctx.strokeStyle = '#5b9dff';
  ctx.fillStyle = 'rgba(91, 157, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  if (
    (tool === 'cellPaint' || tool === 'fill' || (tool === 'cellErase' && !overlay.vectorErase)) &&
    overlay.hover &&
    !overlay.panning
  ) {
    const cellPx = scene.cellPx;
    const cell = pointToCell(scene.gridType, overlay.hover.x, overlay.hover.y, cellPx);
    if (cell.col >= 0 && cell.row >= 0 && cell.col < scene.cols && cell.row < scene.rows) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(91, 157, 255, 0.25)';
      ctx.strokeStyle = '#5b9dff';
      ctx.lineWidth = 1;
      if (scene.gridType === GridType.SQUARE) {
        ctx.fillRect(cell.col * cellPx, cell.row * cellPx, cellPx, cellPx);
        ctx.strokeRect(cell.col * cellPx + 0.5, cell.row * cellPx + 0.5, cellPx - 1, cellPx - 1);
      } else {
        const center = cellCenter(scene.gridType, cell.col, cell.row, cellPx);
        ctx.beginPath();
        ctx.arc(center.x, center.y, cellPx * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  if (tool === 'cellErase' && overlay.vectorErase && overlay.hover && !overlay.panning) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(91, 157, 255, 0.15)';
    ctx.strokeStyle = '#5b9dff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(overlay.hover.x, overlay.hover.y, overlay.eraserSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (
    overlay.draftStart &&
    overlay.draftCurrent &&
    (tool === 'shape' || (tool === 'line' && overlay.lineKind === 'straight'))
  ) {
    const x = Math.min(overlay.draftStart.x, overlay.draftCurrent.x);
    const y = Math.min(overlay.draftStart.y, overlay.draftCurrent.y);
    const w = Math.abs(overlay.draftCurrent.x - overlay.draftStart.x);
    const h = Math.abs(overlay.draftCurrent.y - overlay.draftStart.y);
    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(overlay.draftStart.x, overlay.draftStart.y);
      ctx.lineTo(overlay.draftCurrent.x, overlay.draftCurrent.y);
      ctx.stroke();
    } else {
      const kind = overlay.shapeKind;
      ctx.save();
      ctx.fillStyle = 'rgba(91, 157, 255, 0.2)';
      ctx.beginPath();
      if (kind === 'ellipse') {
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else if (kind === 'rect') {
        ctx.rect(x, y, w, h);
      } else {
        const pts = generateShapePoints(kind, x, y, w, h);
        if (pts.length >= 2) {
          ctx.moveTo(pts[0], pts[1]);
          for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
          ctx.closePath();
        }
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    drawMeasureBox(ctx, overlay, `${(w / scene.cellPx).toFixed(1)} × ${(h / scene.cellPx).toFixed(1)}`);
  }

  if ((tool === 'polygon' || (tool === 'line' && overlay.multiClickLine)) && overlay.draftPoints.length >= 2) {
    const lineKind = overlay.lineKind;
    const smooth = tool === 'line' && (lineKind === 'curve' || lineKind === 'closedCurve');
    if (smooth) {
      const verts = overlay.draftPoints.slice();
      if (overlay.draftCurrent) verts.push(overlay.draftCurrent.x, overlay.draftCurrent.y);
      const closed = lineKind === 'closedCurve';
      if (closed && verts.length >= 6) {
        ctx.save();
        ctx.fillStyle = 'rgba(91, 157, 255, 0.2)';
        traceCurvePath(ctx, verts, true);
        ctx.fill();
        ctx.restore();
      }
      traceCurvePath(ctx, verts, closed);
      ctx.stroke();
      drawSegmentMeasure(ctx, scene, overlay);
    } else {
      if (tool === 'polygon' && overlay.draftPoints.length >= 4) {
        ctx.save();
        ctx.fillStyle = 'rgba(91, 157, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(overlay.draftPoints[0], overlay.draftPoints[1]);
        for (let i = 2; i + 1 < overlay.draftPoints.length; i += 2)
          ctx.lineTo(overlay.draftPoints[i], overlay.draftPoints[i + 1]);
        if (overlay.draftCurrent) ctx.lineTo(overlay.draftCurrent.x, overlay.draftCurrent.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.moveTo(overlay.draftPoints[0], overlay.draftPoints[1]);
      for (let i = 2; i + 1 < overlay.draftPoints.length; i += 2)
        ctx.lineTo(overlay.draftPoints[i], overlay.draftPoints[i + 1]);
      if (overlay.draftCurrent) ctx.lineTo(overlay.draftCurrent.x, overlay.draftCurrent.y);
      ctx.stroke();
      drawSegmentMeasure(ctx, scene, overlay);
    }
  }

  if (tool === 'line' && overlay.lineKind === 'straight' && overlay.draftStart && overlay.draftCurrent) {
    drawSegmentMeasure(ctx, scene, overlay);
  }

  if (tool === 'freehand' && overlay.freehandPoints.length >= 4) {
    ctx.beginPath();
    ctx.moveTo(overlay.freehandPoints[0], overlay.freehandPoints[1]);
    for (let i = 2; i + 1 < overlay.freehandPoints.length; i += 2)
      ctx.lineTo(overlay.freehandPoints[i], overlay.freehandPoints[i + 1]);
    ctx.stroke();
  }

  if (tool === 'stamp' && overlay.stamp) {
    const { image, size, center, rotation, flipX, flipY } = overlay.stamp;
    const iw = image.naturalWidth || image.width || size;
    const ih = image.naturalHeight || image.height || size;
    const fitScale = iw && ih ? Math.min(size / iw, size / ih) : 1;
    const w = iw * fitScale;
    const h = ih * fitScale;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(center.x, center.y);
    if (rotation) ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  if (tool === 'image' && overlay.image) {
    const { image, at, size } = overlay.image;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(image, at.x - size.w / 2, at.y - size.h / 2, size.w, size.h);
    ctx.restore();
  }

  const sel = overlay.selection;
  if (sel) drawSelectionOutline(ctx, scene, sel.layerId, sel.itemId);

  const selImage = overlay.selectedImage;
  if (selImage) drawImageHandles(ctx, selImage);

  const selCurve = overlay.selectedCurve;
  if (selCurve) drawCurveHandles(ctx, selCurve);

  ctx.restore();
}

function drawSelectionOutline(ctx: CanvasRenderingContext2D, scene: MapScene, layerId: string, itemId: string): void {
  const layer = scene.layers.find((l) => l.id === layerId);
  if (!layer) return;
  ctx.save();
  ctx.strokeStyle = '#5b9dff';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  if (layer.kind === 'stamp') {
    const item = layer.items.find((i) => i.id === itemId);
    if (item) ctx.strokeRect(item.x - item.size / 2, item.y - item.size / 2, item.size, item.size);
  } else if (layer.kind === 'image') {
    const item = layer.items.find((i) => i.id === itemId);
    if (item) ctx.strokeRect(item.x - item.w / 2, item.y - item.h / 2, item.w, item.h);
  } else if (layer.kind === 'text') {
    const item = layer.items.find((i) => i.id === itemId);
    if (item) {
      const box = textBox(item);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
    }
  } else if (layer.kind === 'shape') {
    const item = layer.items.find((i) => i.id === itemId);
    const box = item ? shapeBox(item) : null;
    if (box) ctx.strokeRect(box.x, box.y, box.w, box.h);
  } else if (layer.kind === 'freehand') {
    const stroke = layer.strokes.find((s) => s.id === itemId);
    const box = stroke ? strokeBox(stroke.points) : null;
    if (box) ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
  ctx.restore();
}

function drawCurveHandles(ctx: CanvasRenderingContext2D, item: ShapeItem): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#5b9dff';
  ctx.lineWidth = 1.5;
  const p = item.points;
  for (let i = 0; i * 2 + 1 < p.length; i += 1) {
    ctx.beginPath();
    ctx.arc(p[i * 2], p[i * 2 + 1], 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawImageHandles(ctx: CanvasRenderingContext2D, item: ImageItem): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = '#5b9dff';
  const s = 8;
  for (const c of imageCorners(item)) {
    ctx.fillRect(c.x - s / 2, c.y - s / 2, s, s);
  }
  ctx.restore();
}

function traceCurvePath(ctx: CanvasRenderingContext2D, verts: number[], closed: boolean): void {
  ctx.beginPath();
  if (verts.length < 2) return;
  ctx.moveTo(verts[0], verts[1]);
  for (const seg of catmullRomSegments(verts, closed)) {
    ctx.bezierCurveTo(seg.c1x, seg.c1y, seg.c2x, seg.c2y, seg.x, seg.y);
  }
  if (closed) ctx.closePath();
}

function drawMeasureBox(ctx: CanvasRenderingContext2D, overlay: EditorOverlay, text: string): void {
  if (!overlay.hover) return;
  drawMeasureAt(ctx, text, overlay.hover.x + 12, overlay.hover.y - 12);
}

function drawMeasureAt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(text);
  const padX = 6;
  const w = metrics.width + padX * 2;
  const h = 18;
  const r = 4;
  const bx = x;
  const by = y - h / 2;
  ctx.fillStyle = 'rgba(20, 22, 28, 0.85)';
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.arcTo(bx + w, by, bx + w, by + h, r);
  ctx.arcTo(bx + w, by + h, bx, by + h, r);
  ctx.arcTo(bx, by + h, bx, by, r);
  ctx.arcTo(bx, by, bx + w, by, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8e8ea';
  ctx.fillText(text, bx + padX, y);
  ctx.restore();
}

function drawSegmentMeasure(ctx: CanvasRenderingContext2D, scene: MapScene, overlay: EditorOverlay): void {
  const cellPx = scene.cellPx;
  const tool = overlay.tool;
  let ax: number;
  let ay: number;
  let bx: number;
  let by: number;
  let prevAngle: number | null = null;
  if (tool === 'line' && overlay.lineKind === 'straight') {
    if (!overlay.draftStart || !overlay.draftCurrent) return;
    ax = overlay.draftStart.x;
    ay = overlay.draftStart.y;
    bx = overlay.draftCurrent.x;
    by = overlay.draftCurrent.y;
  } else {
    const n = overlay.draftPoints.length;
    if (n < 2 || !overlay.draftCurrent) return;
    ax = overlay.draftPoints[n - 2];
    ay = overlay.draftPoints[n - 1];
    bx = overlay.draftCurrent.x;
    by = overlay.draftCurrent.y;
    if (n >= 4) {
      prevAngle = Math.atan2(ay - overlay.draftPoints[n - 3], ax - overlay.draftPoints[n - 4]);
    }
  }
  const len = Math.hypot(bx - ax, by - ay);
  const cells = overlay.measureLabel.cells((len / cellPx).toFixed(1));
  let angleRad = Math.atan2(by - ay, bx - ax);
  if (prevAngle !== null) angleRad = angleRad - prevAngle;
  let deg = Math.round((angleRad * 180) / Math.PI);
  deg = ((deg % 360) + 360) % 360;
  if (deg > 180) deg -= 360;
  const angle = overlay.measureLabel.angle(deg);
  drawMeasureAt(ctx, `${cells} ${angle}`, bx + 12, by - 12);
}
