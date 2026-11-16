import { traceHexPath } from '@axe/domain/tabletop/hex-geometry';

/** Outlines one hex on a canvas with the context's current stroke style. */
export function strokeHexPath(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  startAngle: number
): void {
  context.beginPath();
  traceHexPath(context, cx, cy, s, startAngle);
  context.stroke();
}

/** Fills one hex on a canvas with the context's current fill style. */
export function fillHexPath(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  startAngle: number
): void {
  context.beginPath();
  traceHexPath(context, cx, cy, s, startAngle);
  context.fill();
}
