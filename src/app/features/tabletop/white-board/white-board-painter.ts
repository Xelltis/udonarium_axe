import { ShapeItem } from '@axe/features/map-editor/model/scene';
import {
  BoardPoint,
  handleAt,
  HANDLES,
  MarkBox,
  SnapGuide,
} from '@axe/features/tabletop/white-board/white-board-scene';

export interface Ink {
  color: string;
  width: number;
}

export const HANDLE_SLACK = 9;
const HOLD_COLOUR = '#2f7fd8';

/** How big a grip is in board pixels, so it stays the same size on screen at any zoom. */
export function gripAt(zoom: number): number {
  return HANDLE_SLACK / Math.max(0.25, zoom);
}

function hairline(zoom: number, width = 1): number {
  return width / Math.max(0.25, zoom);
}

/** Draws snap guides as thin dashed lines in one colour; nothing is drawn when there are none. */
export function drawGuides(
  ctx: CanvasRenderingContext2D,
  guides: readonly SnapGuide[],
  colour: string,
  zoom: number
): void {
  if (guides.length < 1) return;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = hairline(zoom);
  ctx.setLineDash([5, 4]);
  for (const guide of guides) {
    ctx.beginPath();
    if (guide.axis === 'x') {
      ctx.moveTo(guide.at, guide.from);
      ctx.lineTo(guide.at, guide.to);
    } else {
      ctx.moveTo(guide.from, guide.at);
      ctx.lineTo(guide.to, guide.at);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws a line, arrow or shape still being dragged out, in its own stroke or else the current ink. */
export function drawPending(ctx: CanvasRenderingContext2D, item: ShapeItem, ink: Ink): void {
  ctx.save();
  ctx.strokeStyle = item.stroke?.color ?? ink.color;
  ctx.lineWidth = item.stroke?.width ?? ink.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (item.fill?.type === 'solid') ctx.fillStyle = item.fill.color;

  if (item.shape === 'rect') {
    const [x, y, w, h] = item.points;
    if (item.fill?.type === 'solid') ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  } else if (item.shape === 'ellipse') {
    const [x, y, w, h] = item.points;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
    if (item.fill?.type === 'solid') ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(item.points[0], item.points[1]);
    for (let i = 2; i + 1 < item.points.length; i += 2) ctx.lineTo(item.points[i], item.points[i + 1]);
    if (item.shape === 'polygon') ctx.closePath();
    if (item.fill?.type === 'solid') ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws a picture's crop window: the part cut away shaded, the window outlined, and its corner and side grips. */
export function drawTrimWindow(ctx: CanvasRenderingContext2D, box: MarkBox, window: MarkBox, zoom: number): void {
  const cut = { x: box.x + window.x, y: box.y + window.y, w: window.w, h: window.h };
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.rect(cut.x, cut.y, cut.w, cut.h);
  ctx.fill('evenodd');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = hairline(zoom, 1.5);
  ctx.strokeRect(cut.x, cut.y, cut.w, cut.h);
  ctx.fillStyle = '#ffffff';
  const grip = gripAt(zoom);
  for (const handle of HANDLES) {
    if (handle === 'turn') continue;
    const at = handleAt(cut, handle);
    ctx.fillRect(at.x - grip / 2, at.y - grip / 2, grip, grip);
  }
  ctx.restore();
}

/** Draws the dashed box round what is held, with its resize grips and the round grip that turns it. */
export function drawHold(ctx: CanvasRenderingContext2D, box: MarkBox, zoom: number): void {
  ctx.save();
  ctx.strokeStyle = HOLD_COLOUR;
  ctx.lineWidth = hairline(zoom, 1.5);
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  const grip = gripAt(zoom);
  const stalk = handleAt(box, 'turn');
  ctx.beginPath();
  ctx.moveTo(box.x + box.w / 2, box.y);
  ctx.lineTo(stalk.x, stalk.y);
  ctx.stroke();
  for (const handle of HANDLES) {
    const at = handleAt(box, handle);
    if (handle === 'turn') {
      ctx.beginPath();
      ctx.arc(at.x, at.y, grip / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }
    ctx.fillRect(at.x - grip / 2, at.y - grip / 2, grip, grip);
    ctx.strokeRect(at.x - grip / 2, at.y - grip / 2, grip, grip);
  }
  ctx.restore();
}

/** Draws a round grip on each joint of a jointed shape, from its flat list of x, y pairs. */
export function drawJoints(ctx: CanvasRenderingContext2D, points: readonly number[], zoom: number): void {
  ctx.save();
  ctx.strokeStyle = HOLD_COLOUR;
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = hairline(zoom, 1.5);
  const grip = gripAt(zoom);
  for (let joint = 0; joint * 2 + 1 < points.length; joint += 1) {
    const x = points[joint * 2];
    const y = points[joint * 2 + 1];
    ctx.beginPath();
    ctx.arc(x, y, grip / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws a path being laid point by point, on to the pointer when it is hovering, with each point marked.
 *
 * Expects at least one point.
 */
export function drawLaying(
  ctx: CanvasRenderingContext2D,
  laying: readonly BoardPoint[],
  hovering: BoardPoint | null,
  ink: Ink
): void {
  ctx.save();
  ctx.strokeStyle = ink.color;
  ctx.lineWidth = ink.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(laying[0].x, laying[0].y);
  for (const at of laying.slice(1)) ctx.lineTo(at.x, at.y);
  if (hovering) ctx.lineTo(hovering.x, hovering.y);
  ctx.stroke();
  ctx.fillStyle = HOLD_COLOUR;
  for (const at of laying) ctx.fillRect(at.x - 2, at.y - 2, 4, 4);
  ctx.restore();
}

/** Draws the selection box being dragged out, tinted and dashed. */
export function drawBand(ctx: CanvasRenderingContext2D, area: MarkBox, zoom: number): void {
  ctx.save();
  ctx.strokeStyle = HOLD_COLOUR;
  ctx.fillStyle = 'rgba(47,127,216,0.12)';
  ctx.lineWidth = hairline(zoom);
  ctx.setLineDash([3, 3]);
  ctx.fillRect(area.x, area.y, area.w, area.h);
  ctx.strokeRect(area.x, area.y, area.w, area.h);
  ctx.restore();
}

/**
 * Draws a pen stroke still under way, from its flat list of x, y pairs, in the current ink.
 *
 * Unlike the other painters it leaves the context's stroke settings changed.
 */
export function drawFreehand(ctx: CanvasRenderingContext2D, pending: readonly number[], ink: Ink): void {
  ctx.strokeStyle = ink.color;
  ctx.lineWidth = ink.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pending[0], pending[1]);
  for (let i = 2; i < pending.length; i += 2) ctx.lineTo(pending[i], pending[i + 1]);
  ctx.stroke();
}
