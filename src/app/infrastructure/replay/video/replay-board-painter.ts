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
import { calcHexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  isFlatTopGrid,
  isHexGrid,
  traceHexPath,
} from '@axe/domain/tabletop/hex-geometry';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
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
  [ReplayPieceShape.Light]: 4,
  [ReplayPieceShape.Figure]: 5,
};

/**
 * What lies on the ground and is darkened with it: the terrain, masks, notes and cards. Figures,
 * dice, coins and lights stand above the dark, as the table shows them.
 */
const GROUND_SHAPES: ReadonlySet<string> = new Set([
  ReplayPieceShape.Terrain,
  ReplayPieceShape.Mask,
  ReplayPieceShape.Note,
  ReplayPieceShape.Card,
]);

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
  paintTable(ctx, scene, assets, scale, camera);

  const placed = placePieces(paint);
  const ground = placed.filter((one) => GROUND_SHAPES.has(one.piece.shape));
  const standing = placed.filter((one) => !GROUND_SHAPES.has(one.piece.shape));
  for (const one of ground) paintPiece(ctx, one, scene.gridSize, scene.gridType, assets, scale);
  if (scene.overlay) {
    paintReplayDarkness(ctx as unknown as DarknessCanvas, scene.overlay, {
      left: 0,
      top: 0,
      width: scene.width * scene.gridSize,
      height: scene.height * scene.gridSize,
      onBoard: (value) => value,
    });
  }
  if (paint.highlight) paintHighlight(ctx, standing, scene.gridSize, paint.highlight);
  for (const one of standing) paintPiece(ctx, one, scene.gridSize, scene.gridType, assets, scale);
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

function paintTable(
  ctx: ReplayFrameCanvas,
  scene: ReplayBoardScene,
  assets: ReplayFrameAssets,
  scale: number,
  camera: ReplayCameraFrame
) {
  const width = scene.width * scene.gridSize;
  const height = scene.height * scene.gridSize;
  const surface = assets.imageOf(scene.imageIdentifier);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = onScreen(ctx, 40);
  ctx.fillStyle = TABLE_FALLBACK;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  if (surface) ctx.drawImage(surface, 0, 0, width, height);
  if (!scene.gridShow) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.strokeStyle = scene.gridColor;
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  if (isHexGrid(scene.gridType)) traceHexGrid(ctx, scene, camera);
  else if (scene.gridType === 0) traceSquareGrid(ctx, scene, width, height);
  ctx.stroke();
  ctx.restore();
}

function traceSquareGrid(ctx: ReplayFrameCanvas, scene: ReplayBoardScene, width: number, height: number): void {
  for (let column = 1; column < scene.width; column += 1) {
    ctx.moveTo(column * scene.gridSize, 0);
    ctx.lineTo(column * scene.gridSize, height);
  }
  for (let row = 1; row < scene.height; row += 1) {
    ctx.moveTo(0, row * scene.gridSize);
    ctx.lineTo(width, row * scene.gridSize);
  }
}

/** The hex cells the camera can see, traced as the table draws them. */
function traceHexGrid(ctx: ReplayFrameCanvas, scene: ReplayBoardScene, camera: ReplayCameraFrame): void {
  const isFlatTop = isFlatTopGrid(scene.gridType);
  const radius = hexCircumradius(scene.gridSize);
  const { colSpacing, rowSpacing } = hexSpacing(scene.gridSize, isFlatTop);
  const start = hexStartAngle(isFlatTop);
  const firstColumn = Math.max(0, Math.floor(camera.x / colSpacing) - 1);
  const lastColumn = Math.min(
    Math.ceil((scene.width * scene.gridSize) / colSpacing) + 1,
    Math.ceil((camera.x + camera.width) / colSpacing) + 1
  );
  const firstRow = Math.max(0, Math.floor(camera.y / rowSpacing) - 1);
  const lastRow = Math.min(
    Math.ceil((scene.height * scene.gridSize) / rowSpacing) + 1,
    Math.ceil((camera.y + camera.height) / rowSpacing) + 1
  );
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const centre = hexCellCenter(column, row, colSpacing, rowSpacing, isFlatTop);
      traceHexPath(ctx, centre.x, centre.y, radius, start);
    }
  }
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
  gridType: number,
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
      paintTerrain(
        ctx,
        piece,
        picture,
        assets.imageOf(piece.sideImageIdentifier),
        left,
        top,
        size.width,
        size.height,
        grid,
        gridType,
        scale
      );
      break;
    case ReplayPieceShape.Light:
      paintLight(ctx, piece, picture, grid);
      break;
    case ReplayPieceShape.Mask:
      paintMask(ctx, piece, picture, left, top, size.width, size.height, grid, gridType);
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
  ctx.shadowBlur = onScreen(ctx, 12);
  ctx.shadowOffsetY = onScreen(ctx, 4);
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
  ctx.shadowBlur = onScreen(ctx, grid * 0.2);
  ctx.shadowOffsetY = onScreen(ctx, grid * 0.05);
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
  ctx.shadowBlur = onScreen(ctx, width * 0.15);
  ctx.shadowOffsetY = onScreen(ctx, width * 0.04);
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
  ctx.shadowBlur = onScreen(ctx, radius * 0.3);
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

/** How far up the screen a block's top is lifted for each cell it stands tall, as a share of a cell. */
const LIFT_PER_CELL = 0.16;
/** The tallest a block is drawn, in cells, so a tower does not cover the room in front of it. */
const LIFT_MAX_CELLS = 3;

type Point = { x: number; y: number };

/**
 * A block of terrain seen from a little south of straight above, the way the table's tilted view
 * shows it: its top lifted by how tall it stands, tiled a cell to a picture where it is tiled as
 * dungeon walls are, and the faces turned towards the viewer below it in the picture of its sides,
 * shaded by how squarely they face. On a hex table a block is the patch of hexes the table gives it.
 * It casts a shadow as long as it is tall. A door standing open is moved out of the way it barred.
 */
function paintTerrain(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  top: (CanvasImageSource & { width: number; height: number }) | null,
  side: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  upper: number,
  width: number,
  height: number,
  grid: number,
  gridType: number,
  scale: number
): void {
  if (piece.view === 0) return;
  ctx.save();
  openDoor(ctx, piece, left, upper, width, height);

  const outline = outlineOf(piece, left, upper, width, height, grid, gridType);
  const lift = piece.view === 1 ? 0 : Math.min(LIFT_MAX_CELLS, piece.elevation) * grid * LIFT_PER_CELL;
  const raise = upTheScreen(ctx, lift);

  ctx.save();
  if (lift > 0) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = onScreen(ctx, grid * 0.25);
    ctx.shadowOffsetX = onScreen(ctx, lift * 0.2);
    ctx.shadowOffsetY = onScreen(ctx, lift * 0.35);
  }
  ctx.fillStyle = '#2d3038';
  tracePolygon(ctx, outline, { x: 0, y: 0 });
  ctx.fill();
  ctx.restore();

  if (lift > 0) paintSides(ctx, outline, raise, side ?? top, piece.tiled ? grid : 0);
  if (piece.view === 2) {
    ctx.strokeStyle = 'rgba(20, 22, 28, 0.9)';
    ctx.lineWidth = grid * 0.08;
    tracePolygon(ctx, outline, raise);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  tracePolygon(ctx, outline, raise);
  ctx.clip();
  const bounds = boundsOf(outline);
  ctx.fillStyle = '#5d6270';
  ctx.fillRect(bounds.x + raise.x, bounds.y + raise.y, bounds.width, bounds.height);
  if (top) {
    paintSurface(ctx, top, bounds.x + raise.x, bounds.y + raise.y, bounds.width, bounds.height, piece.tiled ? grid : 0);
  }
  ctx.restore();

  ctx.strokeStyle = lift > 0 ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = Math.max(1 / scale, grid * 0.025);
  tracePolygon(ctx, outline, raise);
  ctx.stroke();
  ctx.restore();
}

/**
 * How far a length on the table reaches on the screen, where the drawing now stands.
 *
 * A canvas measures its shadows on the screen whatever it has been scaled by, so a shadow sized
 * in table units has to be carried out to the screen by hand. Left in table units it would
 * shrink as the camera closes in and swell as it pulls away.
 */
function onScreen(ctx: ReplayFrameCanvas, units: number): number {
  const { a, b } = ctx.getTransform();
  return units * Math.hypot(a, b);
}

/** The outline of a block on the table, round its middle: its rectangle, or on a hex table its patch of hexes. */
function outlineOf(
  piece: ReplayBoardPiece,
  left: number,
  upper: number,
  width: number,
  height: number,
  grid: number,
  gridType: number
): Point[] {
  const cells = Math.min(piece.width, piece.height);
  if (isHexGrid(gridType) && cells >= 1) {
    return calcHexFlowerParams(cells, grid, isFlatTopGrid(gridType)).outline.map((point) => ({
      x: point.x,
      y: point.y,
    }));
  }
  return [
    { x: left, y: upper },
    { x: left + width, y: upper },
    { x: left + width, y: upper + height },
    { x: left, y: upper + height },
  ];
}

/**
 * The faces of a block that turn towards the viewer, each standing on an edge of its outline up
 * to its lifted top.
 *
 * Which faces those are is judged on the screen rather than in the block's own frame: a block
 * turned a quarter round still shows the faces that look down the screen, whichever edges of its
 * own they happen to be.
 */
function paintSides(
  ctx: ReplayFrameCanvas,
  outline: readonly Point[],
  raise: Point,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  cell: number
): void {
  const { a: ma, b: mb, c: mc, d: md } = ctx.getTransform();
  const shown = outline.map((point) => ({ x: ma * point.x + mc * point.y, y: mb * point.x + md * point.y }));
  const turn = signedArea(shown) >= 0 ? 1 : -1;
  for (let index = 0; index < outline.length; index += 1) {
    const a = outline[index];
    const b = outline[(index + 1) % outline.length];
    const from = shown[index];
    const to = shown[(index + 1) % outline.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 0.001) continue;
    const southward = (-(to.x - from.x) / length) * turn;
    if (southward <= 0.05) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + raise.x, b.y + raise.y);
    ctx.lineTo(a.x + raise.x, a.y + raise.y);
    ctx.closePath();
    ctx.clip();
    const bounds = boundsOf([a, b, { x: a.x + raise.x, y: a.y + raise.y }, { x: b.x + raise.x, y: b.y + raise.y }]);
    const w = bounds.width || 1;
    const h = bounds.height || 1;
    ctx.fillStyle = '#4a4d57';
    ctx.fillRect(bounds.x, bounds.y, w, h);
    if (picture) paintSurface(ctx, picture, bounds.x, bounds.y, w, h, cell);
    ctx.fillStyle = `rgba(0, 0, 0, ${(0.5 - 0.3 * southward).toFixed(3)})`;
    ctx.fillRect(bounds.x, bounds.y, w, h);
    ctx.restore();
  }
}

function tracePolygon(ctx: ReplayFrameCanvas, points: readonly Point[], shift: Point): void {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x + shift.x, point.y + shift.y);
    else ctx.lineTo(point.x + shift.x, point.y + shift.y);
  });
  ctx.closePath();
}

/**
 * A step of the given length straight up the screen, in the frame the drawing now stands in.
 *
 * A block is lifted towards the top of the screen whichever way it is turned on the table; lifted
 * along its own frame instead, a block turned a quarter round would rise sideways.
 */
function upTheScreen(ctx: ReplayFrameCanvas, length: number): Point {
  if (length === 0) return { x: 0, y: 0 };
  const { a, b, c, d } = ctx.getTransform();
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) return { x: 0, y: -length };
  const x = c / determinant;
  const y = -a / determinant;
  const reach = Math.hypot(x, y) || 1;
  return { x: (x / reach) * length, y: (y / reach) * length };
}

function boundsOf(points: readonly Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Twice the area an outline encloses, positive when it runs clockwise on screen. */
function signedArea(points: readonly Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area;
}

/** Moves an open door out of the way it barred, the way the table moves it. */
function openDoor(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  left: number,
  top: number,
  width: number,
  height: number
): void {
  const door = piece.door;
  if (!door || !door.open) return;
  const alongY = width < height;
  const mirrored = door.mirrored ? -1 : 1;
  switch (door.style) {
    case 'swing': {
      const hingeX = alongY ? 0 : door.mirrored ? left + width : left;
      const hingeY = alongY ? (door.mirrored ? top + height : top) : 0;
      ctx.translate(hingeX, hingeY);
      ctx.rotate(((alongY ? -95 : 95) * mirrored * Math.PI) / 180);
      ctx.translate(-hingeX, -hingeY);
      return;
    }
    case 'slide':
      if (alongY) ctx.translate(0, height * mirrored);
      else ctx.translate(width * mirrored, 0);
      return;
    default:
      ctx.globalAlpha *= 0.25;
  }
}

/**
 * A picture laid over a face, stretched to it or, given a cell size, repeated a cell to a tile from
 * the face's top left corner.
 */
function paintSurface(
  ctx: ReplayFrameCanvas,
  picture: CanvasImageSource & { width: number; height: number },
  left: number,
  top: number,
  width: number,
  height: number,
  cell: number
): void {
  const pattern = cell > 0 && typeof ctx.createPattern === 'function' ? ctx.createPattern(picture, 'repeat') : null;
  if (!pattern || typeof DOMMatrix === 'undefined') {
    ctx.drawImage(picture, left, top, width, height);
    return;
  }
  pattern.setTransform(new DOMMatrix().translate(left, top).scale(cell / picture.width, cell / picture.height));
  ctx.fillStyle = pattern;
  ctx.fillRect(left, top, width, height);
}

/** A light standing on the table: its picture over a glow of its colour, or a small flame where it has no picture. */
function paintLight(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  grid: number
): void {
  const size = grid * piece.size;
  if (!piece.isConcealed) {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.9);
    glow.addColorStop(0, withAlpha(piece.color || '#ffcc66', 0.55));
    glow.addColorStop(1, withAlpha(piece.color || '#ffcc66', 0));
    ctx.fillStyle = glow;
    ctx.fillRect(-size, -size, size * 2, size * 2);
  }
  if (picture && picture.width > 0) {
    const drawn = Math.min(size / picture.width, size / picture.height);
    ctx.drawImage(
      picture,
      (-picture.width * drawn) / 2,
      (-picture.height * drawn) / 2,
      picture.width * drawn,
      picture.height * drawn
    );
    return;
  }
  ctx.fillStyle = piece.color || '#ffcc66';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

/** A colour written as `#rrggbb` with an opacity; anything else is returned as it was. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})/i.exec(color.trim());
  if (!match) return color;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}

/**
 * A mask filled with its colour, with the cells scratched open left clear. On a hex table the mask is
 * made of hex cells, as the table shapes it, and the open ones are hexes too.
 */
function paintMask(
  ctx: ReplayFrameCanvas,
  piece: ReplayBoardPiece,
  picture: (CanvasImageSource & { width: number; height: number }) | null,
  left: number,
  top: number,
  width: number,
  height: number,
  grid: number,
  gridType: number
): void {
  ctx.save();
  ctx.beginPath();
  const hex = computeHexMaskGeometry(piece.width, piece.height, grid, gridType);
  if (hex) {
    const isFlatTop = isFlatTopGrid(gridType);
    const radius = hexCircumradius(grid) + 0.5;
    const { colSpacing, rowSpacing } = hexSpacing(grid, isFlatTop);
    const start = hexStartAngle(isFlatTop);
    const open = new Set(piece.openCells);
    for (let column = 0; column < piece.width; column += 1) {
      for (let row = 0; row < piece.height; row += 1) {
        if (open.has(`${column}:${row}`)) continue;
        const centre = hexCellCenter(column, row, colSpacing, rowSpacing, isFlatTop);
        traceHexPath(ctx, left + centre.x + hex.offsetX, top + centre.y + hex.offsetY, radius, start);
      }
    }
    ctx.clip();
  } else {
    ctx.rect(left, top, width, height);
    for (const cell of piece.openCells) {
      const [column, row] = cell.split(':').map(Number);
      ctx.rect(left + column * grid, top + row * grid, grid, grid);
    }
    ctx.clip('evenodd');
  }
  ctx.fillStyle = piece.color;
  ctx.fillRect(left, top, hex?.pixelW ?? width, hex?.pixelH ?? height);
  if (picture) ctx.drawImage(picture, left, top, hex?.pixelW ?? width, hex?.pixelH ?? height);
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
  ctx.shadowBlur = onScreen(ctx, grid * 0.2);
  ctx.shadowOffsetY = onScreen(ctx, grid * 0.05);
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
  ctx.shadowBlur = onScreen(ctx, grid * 0.4);
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
