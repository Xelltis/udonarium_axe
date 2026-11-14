import { clamp } from '@axe/core/util/clamp';
import { clipPoints } from '@axe/domain/media/cut-in-clip';
import { fillScaleOf, fillStops, rayDegOf } from '@axe/domain/media/cut-in-fill';
import { layoutCutInText } from '@axe/domain/media/cut-in-letter-layout';
import { letterMotionOf, letterPoseAt, letterTimingOf } from '@axe/domain/media/cut-in-letter-motion';
import { withSpeakerName } from '@axe/domain/media/cut-in-speaker';
import { wipePoints } from '@axe/domain/media/cut-in-wipe';
import {
  layerFill,
  type ReplayCutInLayer,
  type ReplayCutInScene,
  replaySampleAt,
  replaySceneDurationOf,
  replaySceneSizeOf,
} from '@axe/domain/replay/replay-cut-in-scene';
import { containRect, coverRect } from '@axe/domain/replay/replay-picture-fit';
import {
  REPLAY_FRAME_FONT_FAMILY,
  type ReplayFrameAssets,
  type ReplayFrameCanvas,
} from '@axe/infrastructure/replay/replay-canvas';

/**
 * A cut-in built out of layers, drawn as it stands `elapsedMs` into its playing.
 *
 * The scene was laid out in the cut-in's own coordinates, which nothing here knows, so the layers
 * are fitted into `area` by the box they take up between them, never blown up past their size.
 * A looping scene starts over; one that does not holds its last moment.
 */
export function paintReplayCutInScene(
  ctx: ReplayFrameCanvas,
  area: { x: number; y: number; width: number; height: number },
  scene: ReplayCutInScene,
  assets: ReplayFrameAssets,
  elapsedMs: number,
  fontFamily: string = REPLAY_FRAME_FONT_FAMILY
): void {
  const durationMs = replaySceneDurationOf(scene);
  const ms = scene.sceneLoop ? elapsedMs % durationMs : Math.min(elapsedMs, durationMs);

  const stage = replaySceneSizeOf(scene);
  const fit = Math.min(area.width / stage.width, area.height / stage.height, 1);
  const originX = area.x + (area.width - stage.width * fit) / 2;
  const originY = area.y + (area.height - stage.height * fit) / 2;

  if (scene.backgroundColor.length > 0) {
    ctx.fillStyle = scene.backgroundColor;
    ctx.fillRect(originX, originY, stage.width * fit, stage.height * fit);
  }

  for (const layer of scene.layers) {
    const sample = replaySampleAt(layer, ms, durationMs);
    if (!sample.visible || sample.opacity <= 0) continue;

    ctx.save();
    ctx.globalAlpha = clamp(sample.opacity, 0, 1);
    if (sample.blur > 0) ctx.filter = `blur(${sample.blur * fit}px)`;

    // A canvas has one shadow rather than a list of filters, so the light and the shadow
    // an effect asks for are drawn as that.
    if (sample.glowPx > 0) {
      ctx.shadowColor = sample.glowColor;
      ctx.shadowBlur = sample.glowPx * fit;
    } else if (sample.shadowPx > 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = sample.shadowPx * fit;
      ctx.shadowOffsetX = (sample.shadowPx / 2) * fit;
      ctx.shadowOffsetY = (sample.shadowPx / 2) * fit;
    }

    // The layer turns and grows around its anchor, which is where the origin is put.
    const pivotX = originX + (sample.x + layer.width * layer.anchorX) * fit;
    const pivotY = originY + (sample.y + layer.height * layer.anchorY) * fit;
    ctx.translate(pivotX, pivotY);
    ctx.rotate((sample.rotation * Math.PI) / 180);
    ctx.scale(sample.scaleX * fit, sample.scaleY * fit);
    leanBy(ctx, layer.skewXDeg, layer.skewYDeg);

    const left = -layer.width * layer.anchorX;
    const top = -layer.height * layer.anchorY;
    clipTo(ctx, layer, left, top);
    wipeTo(ctx, layer, layer.wipeShape, sample.wipe, left, top);
    wipeTo(ctx, layer, layer.crumbleShape, sample.crumble, left, top);
    const sinceMs = ms - clamp(layer.startMs, 0, durationMs);
    paintLayer(ctx, layer, left, top, assets, fontFamily, sinceMs);

    ctx.restore();
  }
}

/** The same lean the browser applies as skew(), written as a matrix. */
function leanBy(ctx: ReplayFrameCanvas, skewXDeg: number, skewYDeg: number): void {
  if (!skewXDeg && !skewYDeg) return;

  const held = (degrees: number) => Math.tan((clamp(degrees || 0, -80, 80) * Math.PI) / 180);
  ctx.transform(1, held(skewYDeg), held(skewXDeg), 1, 0, 0);
}

/** The outline the layer is cut down to, as a path the rest of it is drawn inside. */
function clipTo(ctx: ReplayFrameCanvas, layer: ReplayCutInLayer, left: number, top: number): void {
  if (layer.clip === 'none') return;

  ctx.beginPath();
  if (layer.clip === 'circle') {
    ctx.ellipse(left + layer.width / 2, top + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
  } else {
    const corners = clipPoints(layer.clip);
    if (corners.length < 3) return;
    for (const [at, [x, y]] of corners.entries()) {
      const px = left + x * layer.width;
      const py = top + y * layer.height;
      if (at === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.clip();
}

/** What a name asked for by a text layer reads as in a video, which does not know who played it. */
const UNKNOWN_SPEAKER = '？？？';

/**
 * The words of a text layer, drawn where `layoutCutInText` lays them out. A layer whose letters
 * come on one at a time has each letter drawn where `letterPoseAt` puts it, `sinceMs` after the
 * layer came on, as the stage does.
 */
function paintWords(
  ctx: ReplayFrameCanvas,
  layer: ReplayCutInLayer,
  left: number,
  top: number,
  fontFamily: string,
  sinceMs: number
): void {
  ctx.font = `${layer.fontWeight} ${layer.fontSizePx}px ${fontFamily}`;
  const spaced = 'letterSpacing' in ctx;
  const wasSpaced = spaced ? ctx.letterSpacing : '0px';
  if (spaced) ctx.letterSpacing = `${layer.letterSpacingPx}px`;

  // A video does not know who a cut-in was played for, so a name asked for is left unknown.
  const words = withSpeakerName(layer.text, null, UNKNOWN_SPEAKER);
  const stroked = layer.strokeWidthPx > 0 && layer.strokeColor.length > 0;
  ctx.strokeStyle = layer.strokeColor;
  ctx.lineWidth = layer.strokeWidthPx * 2;
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'middle';

  const motion = letterMotionOf(layer.letterMotion);
  const timing = motion ? letterTimingOf(motion, layer.letterStaggerMs, layer.letterDurationMs) : null;
  const box = { left, top, width: layer.width, height: layer.height };
  const { align, runs } = layoutCutInText(words, box, layer, !!motion, (text) => ctx.measureText(text).width);
  ctx.textAlign = align;

  for (const run of runs) {
    if (!motion || !timing) {
      if (stroked) ctx.strokeText(run.text, run.x, run.y);
      ctx.fillText(run.text, run.x, run.y);
      continue;
    }
    const pose = letterPoseAt(motion, run.rank, sinceMs, layer.fontSizePx, timing);
    if (pose.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= pose.opacity;
    ctx.translate(run.x + pose.dx, run.y + pose.dy);
    ctx.rotate((pose.rotateDeg * Math.PI) / 180);
    ctx.scale(pose.scale, pose.scale);
    if (stroked) ctx.strokeText(run.text, 0, 0);
    ctx.fillText(run.text, 0, 0);
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (spaced) ctx.letterSpacing = wasSpaced;
}

/** What has been let in so far, cut over whatever outline the layer already has. */
function wipeTo(
  ctx: ReplayFrameCanvas,
  layer: ReplayCutInLayer,
  shape: ReplayCutInLayer['wipeShape'],
  amount: number,
  left: number,
  top: number
): void {
  if (shape === 'none') return;

  const corners = wipePoints(shape, amount);
  if (corners.length < 3) return;

  ctx.beginPath();
  for (const [at, [x, y]] of corners.entries()) {
    const px = left + x * layer.width;
    const py = top + y * layer.height;
    if (at === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();
}

function paintLayer(
  ctx: ReplayFrameCanvas,
  layer: ReplayCutInLayer,
  left: number,
  top: number,
  assets: ReplayFrameAssets,
  fontFamily: string,
  sinceMs: number
): void {
  if (layer.kind === 'fill') {
    paintBand(ctx, layer, left, top);
    return;
  }

  if (layer.kind === 'text') {
    paintWords(ctx, layer, left, top, fontFamily, sinceMs);
    return;
  }

  const picture = layer.imageIdentifier ? assets.imageOf(layer.imageIdentifier) : null;
  if (!picture) return;

  // A cropped picture keeps the part it was told to keep, the way object-position does.
  const box = { width: layer.width, height: layer.height };
  const size =
    layer.objectFit === 'cover' ? coverRect(picture, box) : containRect(picture, box.width, box.height, true);
  ctx.drawImage(
    picture,
    left + ((layer.width - size.width) * layer.objectPosX) / 100,
    top + ((layer.height - size.height) * layer.objectPosY) / 100,
    size.width,
    size.height
  );
}

/**
 * A band, in whichever shape it was given.
 *
 * Stripes are drawn as bands rather than as a gradient, because a canvas gradient has no
 * repeat and hard edges are the whole point of them.
 */
function paintBand(ctx: ReplayFrameCanvas, layer: ReplayCutInLayer, left: number, top: number): void {
  const stops = fillStops(layerFill(layer));

  // These two draw a pattern rather than a run of colour, so one colour is enough.
  if (layer.fillShape === 'speedlines') {
    paintSpeedlines(ctx, layer, left, top, stops[0] ?? '#000000');
    return;
  }
  if (layer.fillShape === 'halftone') {
    paintHalftone(ctx, layer, left, top, stops[0] ?? '#000000');
    return;
  }

  if (stops.length < 2) {
    ctx.fillStyle = stops[0] ?? 'transparent';
    ctx.fillRect(left, top, layer.width, layer.height);
    return;
  }
  if (layer.fillShape === 'stripes') {
    paintStripes(ctx, layer, left, top, stops);
    return;
  }

  const midX = left + layer.width / 2;
  const midY = top + layer.height / 2;
  const gradient =
    layer.fillShape === 'radial'
      ? ctx.createRadialGradient(midX, midY, 0, midX, midY, Math.max(layer.width, layer.height) / 2)
      : linearAcross(ctx, layer, midX, midY);

  for (const [at, colour] of stops.entries()) gradient.addColorStop(at / (stops.length - 1), colour);
  ctx.fillStyle = gradient;
  ctx.fillRect(left, top, layer.width, layer.height);
}

/**
 * The line a run of colour is laid along.
 *
 * CSS measures the angle from straight up and turns clockwise, so nought runs upwards and
 * ninety runs to the right. A canvas measures from the x axis instead, and taking one for
 * the other would lay every band across the way it was meant to lie.
 */
function linearAcross(ctx: ReplayFrameCanvas, layer: ReplayCutInLayer, midX: number, midY: number): CanvasGradient {
  const radians = (layer.fillAngleDeg * Math.PI) / 180;
  const halfWidth = (Math.sin(radians) * layer.width) / 2;
  const halfHeight = (-Math.cos(radians) * layer.height) / 2;
  return ctx.createLinearGradient(midX - halfWidth, midY - halfHeight, midX + halfWidth, midY + halfHeight);
}

/** Lines converging on the middle, with the middle left clear when a colour says so. */
function paintSpeedlines(
  ctx: ReplayFrameCanvas,
  layer: ReplayCutInLayer,
  left: number,
  top: number,
  colour: string
): void {
  const fill = layerFill(layer);
  const ray = (rayDegOf(fill) * Math.PI) / 180;
  const midX = left + layer.width / 2;
  const midY = top + layer.height / 2;
  const reach = Math.hypot(layer.width, layer.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, layer.width, layer.height);
  ctx.clip();
  ctx.fillStyle = colour;

  const step = ray * 3;
  const from = ((fill.angleDeg - 90) * Math.PI) / 180;
  for (let turned = 0; turned < Math.PI * 2; turned += step) {
    const angle = from + turned;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(midX + Math.cos(angle) * reach, midY + Math.sin(angle) * reach);
    ctx.lineTo(midX + Math.cos(angle + ray) * reach, midY + Math.sin(angle + ray) * reach);
    ctx.closePath();
    ctx.fill();
  }

  if (fill.to.length > 0) {
    const clear = ctx.createRadialGradient(midX, midY, 0, midX, midY, reach / 2);
    clear.addColorStop(0, fill.to);
    clear.addColorStop(0.55, fill.to);
    clear.addColorStop(1, 'transparent');
    ctx.fillStyle = clear;
    ctx.fillRect(left, top, layer.width, layer.height);
  }
  ctx.restore();
}

/** Dots on a grid, the way a printed screen is made. */
function paintHalftone(
  ctx: ReplayFrameCanvas,
  layer: ReplayCutInLayer,
  left: number,
  top: number,
  colour: string
): void {
  const fill = layerFill(layer);
  const pitch = fillScaleOf(fill);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, layer.width, layer.height);
  ctx.clip();

  if (fill.to.length > 0) {
    ctx.fillStyle = fill.to;
    ctx.fillRect(left, top, layer.width, layer.height);
  }

  ctx.fillStyle = colour;
  for (let y = top; y < top + layer.height + pitch; y += pitch) {
    for (let x = left; x < left + layer.width + pitch; x += pitch) {
      ctx.beginPath();
      ctx.arc(x + pitch / 2, y + pitch / 2, pitch * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintStripes(
  ctx: ReplayFrameCanvas,
  layer: ReplayCutInLayer,
  left: number,
  top: number,
  stops: readonly string[]
): void {
  const radians = (layer.fillAngleDeg * Math.PI) / 180;
  const reach = Math.hypot(layer.width, layer.height);
  const width = fillScaleOf(layerFill(layer));

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, layer.width, layer.height);
  ctx.clip();
  ctx.translate(left + layer.width / 2, top + layer.height / 2);
  ctx.rotate(radians);

  let at = 0;
  for (let offset = -reach; offset < reach; offset += width) {
    ctx.fillStyle = stops[at % stops.length];
    ctx.fillRect(-reach, offset, reach * 2, width);
    at++;
  }
  ctx.restore();
}
