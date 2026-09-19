import {
  footprintOf,
  type ReplayBoardPiece,
  type ReplayBoardScene,
  ReplayPieceShape,
} from '@axe/domain/replay/replay-board-view';
import { coverRect } from '@axe/domain/replay/replay-picture-fit';
import { easeInOut } from '@axe/domain/replay/replay-route';
import { type ReplayPieceState, replayPieceStateAt, STILL_PIECE } from '@axe/domain/replay/video/replay-board-motion';
import type { ReplayCameraFrame } from '@axe/domain/replay/video/replay-video-camera';
import type { ReplayVideoRect } from '@axe/domain/replay/video/replay-video-layout';
import type { ReplayBoardSegment, ReplayMotion } from '@axe/domain/replay/video/replay-video-timeline';
import {
  type ReplayFrameAssets,
  type ReplayFrameCanvas,
  roundedRectPath,
} from '@axe/infrastructure/replay/replay-canvas';
import { type DarknessCanvas, paintReplayDarkness } from '@axe/infrastructure/replay/replay-darkness-painter';

/** What to draw of the board for one frame. */
export interface ReplayBoardPaint {
  /** The board as it stands at the end of the moment. */
  scene: ReplayBoardScene;
  /** The board as it stood at its start, for pieces leaving and faces being turned over. */
  before: ReplayBoardScene | null;
  camera: ReplayCameraFrame;
  area: ReplayVideoRect;
  /** The beat being played, and how far into it the frame is. */
  beat: { segment: ReplayBoardSegment; localMs: number } | null;
  /** The piece whose turn it is to speak, ringed where it stands. */
  highlight: { identifier: string; color: string; localMs: number } | null;
  /** How much the board is darkened, from 0 for none. */
  dim: number;
  labelSize: number;
  popSize: number;
  fontFamily: string;
}

const BACKDROP = '#0b0d12';
const TABLE_FALLBACK = '#262a33';
const POP_MS = 1_400;
const BEAM_MS = 1_000;

/** Which kinds lie under which, whatever their height: the ground first, standing figures last. */
const LAYER_OF_SHAPE: Readonly<Record<string, number>> = {
  [ReplayPieceShape.Terrain]: 0,
  [ReplayPieceShape.Mask]: 1,
  [ReplayPieceShape.Note]: 2,
  [ReplayPieceShape.Card]: 3,
  [ReplayPieceShape.Coin]: 4,
  [ReplayPieceShape.Die]: 4,
  [ReplayPieceShape.Figure]: 5,
};

interface PlacedPiece {
  piece: ReplayBoardPiece;
  state: ReplayPieceState;
  /** The same piece as it stood before the beat, for the face it showed. */
  earlier: ReplayBoardPiece | null;
}

/**
 * Draws the board as the camera sees it into an area of the frame.
 *
 * The room's background lies behind, the table with its picture and grid on it, then the
 * darkness, then the pieces by kind and height, each as it stands at that moment of the beat.
 * Names are written under the figures, values rise over their pieces, effects are drawn from
 * caster to target, and the speaker is ringed where they stand.
 */
export function paintReplayBoard(ctx: ReplayFrameCanvas, paint: ReplayBoardPaint, assets: ReplayFrameAssets): void {
  const { area, camera, scene } = paint;
  const scale = area.width / camera.width;
  const toScreen = (x: number, y: number) => ({
    x: area.x + (x - camera.x) * scale,
    y: area.y + (y - camera.y) * scale,
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.width, area.height);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  paintRoom(ctx, scene, area, assets);

  ctx.save();
  ctx.translate(area.x - camera.x * scale, area.y - camera.y * scale);
  ctx.scale(scale, scale);
  paintTable(ctx, scene, assets, scale);
  if (scene.overlay) {
    const width = scene.width * scene.gridSize;
    const height = scene.height * scene.gridSize;
    paintReplayDarkness(ctx as unknown as DarknessCanvas, scene.overlay, {
      left: 0,
      top: 0,
      width,
      height,
      onBoard: (value) => value,
    });
  }

  const placed = placePieces(paint);
  if (paint.highlight) paintHighlight(ctx, placed, scene.gridSize, paint.highlight);
  for (const one of placed) paintPiece(ctx, one, scene.gridSize, assets, scale);
  ctx.restore();

  const labelFont = `700 ${paint.labelSize}px ${paint.fontFamily}`;
  for (const one of placed) {
    if (!one.piece.showsName || one.piece.name.length < 1 || one.state.alpha <= 0.01) continue;
    const at = positionOf(one);
    const size = footprintOf(one.piece, scene.gridSize);
    const foot = toScreen(at.x + size.width / 2, at.y + size.height);
    paintLabel(ctx, one.piece.name, foot.x, foot.y + paint.labelSize * 0.35, labelFont, one.state.alpha);
  }

  if (paint.beat) {
    const where = (identifier: string) => {
      const one = placed.find((candidate) => candidate.piece.identifier === identifier);
      if (!one) return null;
      const at = positionOf(one);
      const size = footprintOf(one.piece, scene.gridSize);
      return {
        centre: toScreen(at.x + size.width / 2, at.y + size.height / 2),
        top: toScreen(at.x + size.width / 2, at.y),
      };
    };
    paintBeams(ctx, paint.beat.segment, paint.beat.localMs, where, scale * scene.gridSize);
    paintPops(ctx, paint.beat.segment, paint.beat.localMs, where, paint.popSize, paint.fontFamily);
  }

  if (paint.dim > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, paint.dim)})`;
    ctx.fillRect(area.x, area.y, area.width, area.height);
  }
  ctx.restore();
}

/**
 * The background of the room, filling the area behind the table, darkened a little so the table
 * stands out. A room with none has the table's own picture spread behind it, blurred and dark, so a
 * table narrower than the picture does not stand between black bars.
 */
function paintRoom(ctx: ReplayFrameCanvas, scene: ReplayBoardScene, area: ReplayVideoRect, assets: ReplayFrameAssets) {
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(area.x, area.y, area.width, area.height);
  const room = assets.imageOf(scene.backgroundImageIdentifier);
  if (room) {
    const rect = coverRect(room, area);
    ctx.drawImage(room, area.x + rect.x, area.y + rect.y, rect.width, rect.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(area.x, area.y, area.width, area.height);
    return;
  }
  const surface = assets.imageOf(scene.imageIdentifier);
  const ambient = surface ? ambientOf(surface, area) : null;
  if (ambient) ctx.drawImage(ambient, area.x, area.y, area.width, area.height);
}

const ambientCache = new WeakMap<object, { width: number; height: number; canvas: OffscreenCanvas }>();

/** A picture spread over an area, blurred and darkened once and kept, since blurring every frame costs too much. */
function ambientOf(picture: CanvasImageSource & { width: number; height: number }, area: ReplayVideoRect) {
  const width = Math.max(1, Math.round(area.width / 4));
  const height = Math.max(1, Math.round(area.height / 4));
  const known = ambientCache.get(picture);
  if (known && known.width === width && known.height === height) return known.canvas;
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return null;
  const rect = coverRect(picture, { width, height });
  context.filter = `blur(${Math.max(2, Math.round(width / 60))}px) brightness(0.4) saturate(0.8)`;
  context.drawImage(picture, rect.x - width * 0.05, rect.y - height * 0.05, rect.width * 1.1, rect.height * 1.1);
  ambientCache.set(picture, { width, height, canvas });
  return canvas;
}

function paintTable(ctx: ReplayFrameCanvas, scene: ReplayBoardScene, assets: ReplayFrameAssets, scale: number) {
  const width = scene.width * scene.gridSize;
  const height = scene.height * scene.gridSize;
  const surface = assets.imageOf(scene.imageIdentifier);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 40 / scale;
  ctx.fillStyle = TABLE_FALLBACK;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  if (surface) ctx.drawImage(surface, 0, 0, width, height);

  if (!scene.gridShow || scene.gridType !== 0) return;
  ctx.save();
  ctx.strokeStyle = scene.gridColor;
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  for (let column = 1; column < scene.width; column += 1) {
    ctx.moveTo(column * scene.gridSize, 0);
    ctx.lineTo(column * scene.gridSize, height);
  }
  for (let row = 1; row < scene.height; row += 1) {
    ctx.moveTo(0, row * scene.gridSize);
    ctx.lineTo(width, row * scene.gridSize);
  }
  ctx.stroke();
  ctx.restore();
}

/** Every piece to draw, in the order to draw them: those on the board now, and those leaving it. */
function placePieces(paint: ReplayBoardPaint): PlacedPiece[] {
  const motionsOf = new Map<string, ReplayMotion[]>();
  for (const motion of paint.beat?.segment.motions ?? []) {
    const list = motionsOf.get(motion.targetId);
    if (list) list.push(motion);
    else motionsOf.set(motion.targetId, [motion]);
  }
  const localMs = paint.beat?.localMs ?? 0;
  const earlierOf = new Map((paint.before?.pieces ?? []).map((piece) => [piece.identifier, piece]));
  const placed: PlacedPiece[] = [];
  const present = new Set<string>();

  for (const piece of paint.scene.pieces) {
    present.add(piece.identifier);
    const motions = motionsOf.get(piece.identifier);
    const state = motions ? replayPieceStateAt(motions, localMs) : STILL_PIECE;
    placed.push({ piece, state, earlier: earlierOf.get(piece.identifier) ?? null });
  }
  for (const piece of paint.before?.pieces ?? []) {
    if (present.has(piece.identifier)) continue;
    const motions = motionsOf.get(piece.identifier);
    if (!motions?.some((motion) => motion.kind === 'depart')) continue;
    placed.push({ piece, state: replayPieceStateAt(motions, localMs), earlier: piece });
  }

  return placed.sort(
    (a, b) =>
      (LAYER_OF_SHAPE[a.piece.shape] ?? 5) - (LAYER_OF_SHAPE[b.piece.shape] ?? 5) ||
      a.piece.z - b.piece.z ||
      a.piece.y - b.piece.y
  );
}

function positionOf(one: PlacedPiece): { x: number; y: number } {
  return one.state.position ?? { x: one.piece.x, y: one.piece.y };
}

function paintPiece(
  ctx: ReplayFrameCanvas,
  one: PlacedPiece,
  grid: number,
  assets: ReplayFrameAssets,
  scale: number
): void {
  const { state } = one;
  if (state.alpha <= 0.001 || state.scaleX <= 0.001) return;
  const piece = state.showsBefore && one.earlier ? one.earlier : one.piece;
  const at = positionOf(one);
  const size = footprintOf(piece, grid);
  const picture = assets.imageOf(piece.imageIdentifier);
  const height =
    piece.shape === ReplayPieceShape.Card && picture ? (size.width * picture.height) / picture.width : size.height;

  ctx.save();
  ctx.globalAlpha *= state.alpha;
  ctx.translate(at.x + size.width / 2 + state.shakeX * grid, at.y + size.height / 2 - state.lift * grid);
  ctx.rotate((((state.rotate ?? piece.rotate) + state.shakeAngle) * Math.PI) / 180);
  ctx.scale(state.scale * state.scaleX, state.scale);

  const left = -size.width / 2;
  const top = -size.height / 2;
  switch (piece.shape) {
    case ReplayPieceShape.Figure:
      paintFigure(ctx, picture, left, top, size.width, size.height, scale);
      break;
    case ReplayPieceShape.Card:
      paintCard(ctx, piece, picture, left, top, size.width, height, grid);
      break;
    case ReplayPieceShape.Die:
      paintDie(ctx, piece, picture, left, top, size.width, size.height);
      break;
    case ReplayPieceShape.Coin:
      paintCoin(ctx, picture, left, top, size.width, size.height);
      break;
    case ReplayPieceShape.Terrain:
      paintTerrain(ctx, picture, left, top, size.width, size.height, scale);
      break;
    case ReplayPieceShape.Mask:
      paintMask(ctx, piece, picture, left, top, size.width, size.height, grid);
      break;
    case ReplayPieceShape.Note:
      paintNote(ctx, piece, left, top, size.width, size.height, grid);
      break;
  }
  ctx.restore();
}

/** A figure stands on its cells, its picture as wide as they are and rising from their foot. */
function paintFigure(
  ctx: ReplayFrameCanvas,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  top: number,
  width: number,
  height: number,
  scale: number
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, top + height * 0.92, width * 0.42, height * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!picture || picture.width < 1) {
    ctx.fillStyle = 'rgba(122, 162, 255, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(0, 0, width * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const drawnHeight = Math.min(width * 3, (width * picture.height) / picture.width);
  const drawnWidth = (drawnHeight * picture.width) / picture.height;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 12 / scale;
  ctx.shadowOffsetY = 4 / scale;
  ctx.drawImage(picture, -drawnWidth / 2, top + height - drawnHeight, drawnWidth, drawnHeight);
  ctx.restore();
}

function paintCard(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  top: number,
  width: number,
  height: number,
  grid: number
): void {
  const radius = width * 0.06;
  if (piece.count > 1) {
    for (let layer = Math.min(3, piece.count - 1); layer > 0; layer -= 1) {
      ctx.fillStyle = 'rgba(235, 235, 240, 0.9)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = grid * 0.01;
      if (roundedRectPath(ctx, left + layer * grid * 0.04, top + layer * grid * 0.04, width, height, radius)) {
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = grid * 0.2;
  ctx.shadowOffsetY = grid * 0.05;
  ctx.fillStyle = picture ? '#ffffff' : '#2f3e6e';
  if (roundedRectPath(ctx, left, top, width, height, radius)) ctx.fill();
  else ctx.fillRect(left, top, width, height);
  ctx.restore();

  ctx.save();
  if (roundedRectPath(ctx, left, top, width, height, radius)) ctx.clip();
  if (picture) ctx.drawImage(picture, left, top, width, height);
  else if (piece.text.length > 0 || piece.name.length > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${width * 0.16}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(piece.name, 0, 0, width * 0.9);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = grid * 0.03;
  if (roundedRectPath(ctx, left, top, width, height, radius)) ctx.stroke();

  if (piece.count > 1) {
    const badge = grid * 0.32;
    ctx.fillStyle = 'rgba(15, 18, 26, 0.9)';
    ctx.beginPath();
    ctx.arc(left + width - badge * 0.2, top + badge * 0.2, badge, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${badge * 1.05}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(piece.count), left + width - badge * 0.2, top + badge * 0.24);
  }
}

function paintDie(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  top: number,
  width: number,
  height: number
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = width * 0.15;
  ctx.shadowOffsetY = width * 0.04;
  if (picture && !piece.isConcealed) {
    ctx.drawImage(picture, left, top, width, height);
    ctx.restore();
    return;
  }
  ctx.fillStyle = piece.isConcealed ? '#3a3f4b' : '#fbfbf7';
  if (roundedRectPath(ctx, left, top, width, height, width * 0.18)) ctx.fill();
  else ctx.fillRect(left, top, width, height);
  ctx.restore();
  ctx.fillStyle = piece.isConcealed ? '#ffffff' : '#1d2230';
  ctx.font = `800 ${height * 0.55}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(piece.isConcealed ? '?' : piece.text, 0, height * 0.03, width * 0.9);
}

function paintCoin(
  ctx: ReplayFrameCanvas,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  top: number,
  width: number,
  height: number
): void {
  const radius = Math.min(width, height) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = radius * 0.3;
  ctx.fillStyle = '#d9b44a';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (!picture) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(picture, left, top, width, height);
  ctx.restore();
}

function paintTerrain(
  ctx: ReplayFrameCanvas,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  top: number,
  width: number,
  height: number,
  scale: number
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 16 / scale;
  ctx.shadowOffsetY = 6 / scale;
  ctx.fillStyle = '#5d6270';
  ctx.fillRect(left, top, width, height);
  ctx.restore();
  if (picture) ctx.drawImage(picture, left, top, width, height);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2 / scale;
  ctx.strokeRect(left, top, width, height);
}

function paintMask(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  top: number,
  width: number,
  height: number,
  grid: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  for (const cell of piece.openCells) {
    const [column, row] = cell.split(':').map(Number);
    ctx.rect(left + column * grid, top + row * grid, grid, grid);
  }
  ctx.clip('evenodd');
  ctx.fillStyle = piece.color;
  ctx.fillRect(left, top, width, height);
  if (picture) ctx.drawImage(picture, left, top, width, height);
  ctx.restore();
}

function paintNote(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  left: number,
  top: number,
  width: number,
  height: number,
  grid: number
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = grid * 0.2;
  ctx.shadowOffsetY = grid * 0.05;
  ctx.fillStyle = '#fbf3d5';
  ctx.fillRect(left, top, width, height);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  const pad = grid * 0.12;
  ctx.fillStyle = '#2b2620';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${grid * 0.3}px sans-serif`;
  ctx.fillText(piece.title, left + pad, top + pad, width - pad * 2);
  ctx.font = `400 ${grid * 0.22}px sans-serif`;
  const lines = piece.text.split('\n');
  for (const [index, line] of lines.entries()) {
    const y = top + pad + grid * 0.42 + index * grid * 0.3;
    if (y > top + height) break;
    ctx.fillText(line, left + pad, y, width - pad * 2);
  }
  ctx.restore();
}

/** A soft ring round the feet of whoever is speaking, breathing as they talk. */
function paintHighlight(
  ctx: ReplayFrameCanvas,
  placed: readonly PlacedPiece[],
  grid: number,
  highlight: NonNullable<ReplayBoardPaint['highlight']>
): void {
  const one = placed.find((candidate) => candidate.piece.identifier === highlight.identifier);
  if (!one) return;
  const at = positionOf(one);
  const size = footprintOf(one.piece, grid);
  const appear = easeInOut(Math.min(1, highlight.localMs / 400));
  const breath = 0.75 + 0.25 * Math.sin(highlight.localMs / 260);
  ctx.save();
  ctx.globalAlpha *= appear * breath;
  ctx.strokeStyle = highlight.color || '#ffffff';
  ctx.lineWidth = grid * 0.08;
  ctx.shadowColor = highlight.color || '#ffffff';
  ctx.shadowBlur = grid * 0.4;
  ctx.beginPath();
  ctx.ellipse(
    at.x + size.width / 2,
    at.y + size.height * 0.9,
    size.width * 0.62,
    size.height * 0.22,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();
}

/** A name set under a piece, white on a dark outline so it reads on any table. */
function paintLabel(ctx: ReplayFrameCanvas, text: string, x: number, y: number, font: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = Math.max(3, parseFloat(font.split(' ')[1]) * 0.22);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

type ScreenOf = (identifier: string) => { centre: { x: number; y: number }; top: { x: number; y: number } } | null;

function paintBeams(
  ctx: ReplayFrameCanvas,
  segment: ReplayBoardSegment,
  localMs: number,
  where: ScreenOf,
  cell: number
): void {
  for (const beam of segment.beams) {
    const elapsed = localMs - beam.startMs;
    if (elapsed < 0 || elapsed > BEAM_MS) continue;
    const from = where(beam.fromId);
    if (!from) continue;
    const reach = easeInOut(Math.min(1, elapsed / 400));
    const fade = elapsed > BEAM_MS - 300 ? (BEAM_MS - elapsed) / 300 : 1;
    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.strokeStyle = '#ffd166';
    ctx.shadowColor = '#ffb703';
    ctx.shadowBlur = cell * 0.5;
    ctx.lineWidth = Math.max(4, cell * 0.12);
    ctx.lineCap = 'round';
    for (const id of beam.toIds) {
      const to = where(id);
      if (!to) continue;
      ctx.beginPath();
      ctx.moveTo(from.centre.x, from.centre.y);
      ctx.lineTo(
        from.centre.x + (to.centre.x - from.centre.x) * reach,
        from.centre.y + (to.centre.y - from.centre.y) * reach
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** A change of value rising over its piece: the difference large, what it came to small beneath. */
function paintPops(
  ctx: ReplayFrameCanvas,
  segment: ReplayBoardSegment,
  localMs: number,
  where: ScreenOf,
  size: number,
  fontFamily: string
): void {
  for (const pop of segment.pops) {
    const elapsed = localMs - pop.startMs;
    if (elapsed < 0 || elapsed > POP_MS) continue;
    const anchor = where(pop.targetId);
    if (!anchor) continue;
    const grow = elapsed < 180 ? 0.6 + (elapsed / 180) * 0.5 : elapsed < 300 ? 1.1 - ((elapsed - 180) / 120) * 0.1 : 1;
    const rise = easeInOut(elapsed / POP_MS) * size * 1.2;
    const fade = elapsed > POP_MS - 400 ? (POP_MS - elapsed) / 400 : 1;
    const x = anchor.top.x;
    const y = anchor.top.y - size * 0.4 - rise;
    const delta = `${pop.delta > 0 ? '+' : ''}${pop.delta}`;

    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.translate(x, y);
    ctx.scale(grow, grow);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.font = `900 ${size}px ${fontFamily}`;
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.strokeText(delta, 0, 0);
    ctx.fillStyle = pop.delta < 0 ? '#ff6b6b' : '#6bff9e';
    ctx.fillText(delta, 0, 0);
    const detail = `${pop.label} ${pop.value}`.trim();
    ctx.font = `700 ${size * 0.45}px ${fontFamily}`;
    ctx.lineWidth = size * 0.1;
    ctx.strokeText(detail, 0, size * 0.55);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(detail, 0, size * 0.55);
    ctx.restore();
  }
}
