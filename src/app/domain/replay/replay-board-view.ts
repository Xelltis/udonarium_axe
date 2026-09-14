import { groupReplayChildren, replayValueOfNamed } from '@axe/domain/replay/replay-data-tree';
import { syncValueOf } from '@axe/domain/replay/replay-diff';
import type { ReplayViewer } from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { replayOverlayPlan } from '@axe/domain/replay/replay-vision-scene';
import type { OverlayPlan } from '@axe/domain/tabletop/vision-scene';

export interface ReplayBoardPiece {
  identifier: string;
  aliasName: string;
  x: number;
  y: number;
  z: number;
  size: number;
  rotate: number;
  name: string;
  imageIdentifier: string;
}

export interface ReplayBoardScene {
  width: number;
  height: number;
  gridSize: number;
  imageIdentifier: string;
  backgroundImageIdentifier: string;
  pieces: readonly ReplayBoardPiece[];
  /** The darkness, the sight and the lights of that moment. Null for a table that uses no darkness. */
  overlay: OverlayPlan | null;
}

const TABLE_ALIAS = 'game-table';
const SELECTER_ALIAS = 'TableSelecter';
const TABLE_PLACE = 'table';

const PIECE_ALIASES: ReadonlySet<string> = new Set([
  'character',
  'card',
  'card-stack',
  'terrain',
  'table-mask',
  'text-note',
  'dice-symbol',
  'coin',
]);

export interface ReplayBoardSceneOptions {
  /**
   * Whether to work the darkness and the lights out.
   *
   * It is expensive, and is left out where it is not wanted, such as a pass that only counts the pictures.
   */
  withOverlay?: boolean;
}

/**
 * The board as it stood at one moment of a recording, seen from above.
 *
 * The table is the one being viewed at the time, or the first there is. Only pieces placed on
 * the table are drawn, lowest first. Null when the recording holds no table. The darkness is
 * worked out only when a viewer is given and it has not been turned off.
 */
export function buildReplayBoardScene(
  snapshots: readonly ReplayObjectSnapshot[],
  viewer?: ReplayViewer,
  options?: ReplayBoardSceneOptions
): ReplayBoardScene | null {
  const table = viewTableOf(snapshots);
  if (!table) return null;

  const childrenOf = groupReplayChildren(snapshots);
  const pieces: ReplayBoardPiece[] = [];
  for (const snapshot of snapshots) {
    if (!PIECE_ALIASES.has(snapshot.aliasName)) continue;

    const location = syncValueOf(snapshot.syncData, 'location') as Record<string, unknown> | undefined;
    if (!location || String(location['name'] ?? '') !== TABLE_PLACE) continue;

    pieces.push({
      identifier: snapshot.identifier,
      aliasName: snapshot.aliasName,
      x: numberOf(location['x']),
      y: numberOf(location['y']),
      z: numberOf(syncValueOf(snapshot.syncData, 'posZ')),
      size: Math.max(0.25, numberOf(replayValueOfNamed(childrenOf, snapshot.identifier, ['common', 'size']), 1)),
      rotate: numberOf(syncValueOf(snapshot.syncData, 'rotate')),
      name: replayValueOfNamed(childrenOf, snapshot.identifier, ['common', 'name']),
      imageIdentifier: replayValueOfNamed(childrenOf, snapshot.identifier, ['image', 'imageIdentifier']),
    });
  }

  pieces.sort((a, b) => a.z - b.z || a.y - b.y);

  return {
    width: Math.max(1, numberOf(syncValueOf(table.syncData, 'width'), 20)),
    height: Math.max(1, numberOf(syncValueOf(table.syncData, 'height'), 20)),
    gridSize: Math.max(1, numberOf(syncValueOf(table.syncData, 'gridSize'), 50)),
    imageIdentifier: String(syncValueOf(table.syncData, 'imageIdentifier') ?? ''),
    backgroundImageIdentifier: String(syncValueOf(table.syncData, 'backgroundImageIdentifier') ?? ''),
    pieces,
    overlay: viewer && options?.withOverlay !== false ? replayOverlayPlan(snapshots, viewer) : null,
  };
}

export interface ReplayBoardFraming {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const REPLAY_BOARD_PADDING_CELLS = 2;

/**
 * The part of the table to frame, in pixels: the pieces with a margin of cells round them, kept
 * within the table.
 *
 * The whole table is framed when there are no pieces or the pieces would give a frame less
 * than a cell across.
 */
export function framingOf(scene: ReplayBoardScene, paddingCells = REPLAY_BOARD_PADDING_CELLS): ReplayBoardFraming {
  const whole = { x: 0, y: 0, width: scene.width * scene.gridSize, height: scene.height * scene.gridSize };
  if (scene.pieces.length < 1) return whole;

  const pad = paddingCells * scene.gridSize;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const piece of scene.pieces) {
    const span = piece.size * scene.gridSize;
    left = Math.min(left, piece.x);
    top = Math.min(top, piece.y);
    right = Math.max(right, piece.x + span);
    bottom = Math.max(bottom, piece.y + span);
  }

  left = Math.max(whole.x, left - pad);
  top = Math.max(whole.y, top - pad);
  right = Math.min(whole.width, right + pad);
  bottom = Math.min(whole.height, bottom + pad);
  if (right - left < scene.gridSize || bottom - top < scene.gridSize) return whole;

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The pictures a board scene draws: the table, its background and every piece. Entries can be empty strings. */
export function collectBoardAssetIds(scene: ReplayBoardScene | null): string[] {
  if (!scene) return [];
  return [
    scene.imageIdentifier,
    scene.backgroundImageIdentifier,
    ...scene.pieces.map((piece) => piece.imageIdentifier),
  ];
}

function viewTableOf(snapshots: readonly ReplayObjectSnapshot[]): ReplayObjectSnapshot | null {
  const tables = snapshots.filter((snapshot) => snapshot.aliasName === TABLE_ALIAS);
  if (tables.length < 1) return null;

  const selecter = snapshots.find((snapshot) => snapshot.aliasName === SELECTER_ALIAS);
  const wanted = selecter ? String(syncValueOf(selecter.syncData, 'viewTableIdentifier') ?? '') : '';
  return tables.find((table) => table.identifier === wanted) ?? tables[0];
}

function numberOf(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
