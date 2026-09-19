import { PeerRole } from '@axe/domain/peer/peer-role';
import { groupReplayChildren, replayElementOfNamed, replayValueOfNamed } from '@axe/domain/replay/replay-data-tree';
import { syncValueOf } from '@axe/domain/replay/replay-diff';
import type { ReplayViewer } from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { visibilityOfDisclosure } from '@axe/domain/replay/replay-visibility';
import { replayDarknessOf } from '@axe/domain/replay/replay-vision-scene';
import type { OverlayPlan } from '@axe/domain/tabletop/vision-scene';

/** How a piece is drawn: as a standing figure, a card, a die and so on. */
export const ReplayPieceShape = {
  Figure: 'figure',
  Card: 'card',
  Die: 'die',
  Coin: 'coin',
  Terrain: 'terrain',
  Mask: 'mask',
  Note: 'note',
  Light: 'light',
} as const;

export type ReplayPieceShape = (typeof ReplayPieceShape)[keyof typeof ReplayPieceShape];

export interface ReplayBoardPiece {
  identifier: string;
  aliasName: string;
  x: number;
  y: number;
  z: number;
  size: number;
  rotate: number;
  name: string;
  /** The picture it shows now: the face up of a card or a coin, the face rolled of a die, the top card of a pile. */
  imageIdentifier: string;
  shape: ReplayPieceShape;
  /** How many cells across it covers. */
  width: number;
  /** How many cells down it covers. For a card, 0: its picture decides. */
  height: number;
  /** Whether its name is written under it. */
  showsName: boolean;
  /** Whether what it shows is kept from the viewer, as a die rolled in secret is. */
  isConcealed: boolean;
  /** The fill of a mask. Empty for anything else. */
  color: string;
  /** The title of a note. */
  title: string;
  /** The text of a note, the words on a card's face, or the face a die shows. */
  text: string;
  /** How many cards a pile holds. 0 for anything but a pile. */
  count: number;
  /** The cells of a mask scratched open, each as `column:row` within the mask. */
  openCells: readonly string[];
  /** Whether its picture is laid a cell to a tile rather than stretched over it, as dungeon walls are. */
  tiled: boolean;
  /** How many cells tall it stands, for a block of terrain. */
  elevation: number;
  /** Which faces of a block of terrain are shown (`TerrainViewState`): 3 all, 1 the floor, 2 the walls, 0 none. */
  view: number;
  /** How a door opens and whether it stands open. Null for anything that is not a door. */
  door: { style: string; open: boolean; mirrored: boolean } | null;
  /** The picture on the sides of a block of terrain, such as the bricks of a wall. */
  sideImageIdentifier: string;
}

export interface ReplayBoardScene {
  width: number;
  height: number;
  gridSize: number;
  /** The kind of grid: square, hexagonal either way, or none (`GridType`). */
  gridType: number;
  /** Whether the grid is drawn over the table, and in what colour. */
  gridShow: boolean;
  gridColor: string;
  imageIdentifier: string;
  backgroundImageIdentifier: string;
  pieces: readonly ReplayBoardPiece[];
  /** The darkness, the sight and the lights of that moment. Null for a table that uses no darkness. */
  overlay: OverlayPlan | null;
}

const TABLE_ALIAS = 'game-table';
const SELECTER_ALIAS = 'TableSelecter';
const TABLE_PLACE = 'table';

const SHAPE_OF_ALIAS: ReadonlyMap<string, ReplayPieceShape> = new Map([
  ['character', ReplayPieceShape.Figure],
  ['card', ReplayPieceShape.Card],
  ['card-stack', ReplayPieceShape.Card],
  ['terrain', ReplayPieceShape.Terrain],
  ['table-mask', ReplayPieceShape.Mask],
  ['text-note', ReplayPieceShape.Note],
  ['dice-symbol', ReplayPieceShape.Die],
  ['coin', ReplayPieceShape.Coin],
  ['light-source', ReplayPieceShape.Light],
]);

/** Whether objects of this kind are pieces drawn on the board. */
export function isReplayBoardPieceAlias(aliasName: string): boolean {
  return SHAPE_OF_ALIAS.has(aliasName);
}

const CARD_ALIAS = 'card';
const CARD_STACK_ALIAS = 'card-stack';
const CARD_ROOT_NAME = 'cardRoot';
const CARD_BACK_STATE = 1;
const SQUARE_GRID = 0;

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
 * the table are drawn, lowest first, each as its kind is: a card by the face it lies on, a die by
 * the face rolled, a pile by its top card. Given a viewer, a piece kept from them is left off and a
 * die someone else rolled in secret keeps its face hidden, and the darkness is worked out unless it
 * has been turned off. Null when the recording holds no table.
 */
export function buildReplayBoardScene(
  snapshots: readonly ReplayObjectSnapshot[],
  viewer?: ReplayViewer,
  options?: ReplayBoardSceneOptions
): ReplayBoardScene | null {
  const table = viewTableOf(snapshots);
  if (!table) return null;

  const childrenOf = groupReplayChildren(snapshots);
  const reading: PieceReading = { childrenOf, snapshots, viewer, cardsOf: null };
  const otherTables = new Set(
    snapshots
      .filter((one) => one.aliasName === TABLE_ALIAS && one.identifier !== table.identifier)
      .map((one) => one.identifier)
  );
  const darkness = viewer && options?.withOverlay !== false ? replayDarknessOf(snapshots, viewer) : null;
  const pieces: ReplayBoardPiece[] = [];
  for (const snapshot of snapshots) {
    const shape = SHAPE_OF_ALIAS.get(snapshot.aliasName);
    if (!shape) continue;

    const location = syncValueOf(snapshot.syncData, 'location') as Record<string, unknown> | undefined;
    if (!location || String(location['name'] ?? '') !== TABLE_PLACE) continue;
    if (otherTables.has(String(snapshot.syncData['parentIdentifier'] ?? ''))) continue;
    if (viewer && !canSeePiece(snapshot, viewer)) continue;

    const piece = readPiece(snapshot, shape, numberOf(location['x']), numberOf(location['y']), reading);
    if (darkness && piece.shape === ReplayPieceShape.Figure && !seenIn(darkness, piece, table)) continue;
    pieces.push(piece);
  }

  pieces.sort((a, b) => a.z - b.z || a.y - b.y);

  return {
    width: Math.max(1, numberOf(syncValueOf(table.syncData, 'width'), 20)),
    height: Math.max(1, numberOf(syncValueOf(table.syncData, 'height'), 20)),
    gridSize: Math.max(1, numberOf(syncValueOf(table.syncData, 'gridSize'), 50)),
    gridType: numberOf(syncValueOf(table.syncData, 'gridType'), SQUARE_GRID),
    gridShow: booleanOf(syncValueOf(table.syncData, 'gridShow')),
    gridColor: String(syncValueOf(table.syncData, 'gridColor') ?? '') || '#000000e6',
    imageIdentifier: String(syncValueOf(table.syncData, 'imageIdentifier') ?? ''),
    backgroundImageIdentifier: String(syncValueOf(table.syncData, 'backgroundImageIdentifier') ?? ''),
    pieces,
    overlay: darkness?.plan ?? null,
  };
}

interface PieceReading {
  childrenOf: Map<string, ReplayObjectSnapshot[]>;
  snapshots: readonly ReplayObjectSnapshot[];
  viewer: ReplayViewer | undefined;
  /** The cards under each pile's card root, top first, worked out the first time a pile asks. */
  cardsOf: Map<string, ReplayObjectSnapshot[]> | null;
}

function readPiece(
  snapshot: ReplayObjectSnapshot,
  shape: ReplayPieceShape,
  x: number,
  y: number,
  reading: PieceReading
): ReplayBoardPiece {
  const common = (name: string): string =>
    replayValueOfNamed(reading.childrenOf, snapshot.identifier, ['common', name]);
  const image = (name: string): string => replayValueOfNamed(reading.childrenOf, snapshot.identifier, ['image', name]);
  const attribute = (name: string): unknown => syncValueOf(snapshot.syncData, name);
  const size = Math.max(0.25, numberOf(common('size'), shape === ReplayPieceShape.Card ? 2 : 1));

  const piece: ReplayBoardPiece = {
    identifier: snapshot.identifier,
    aliasName: snapshot.aliasName,
    x,
    y,
    z: numberOf(attribute('posZ')),
    size,
    rotate: numberOf(attribute('rotate')),
    name: common('name'),
    imageIdentifier: image('imageIdentifier'),
    shape,
    width: size,
    height: size,
    showsName: shape === ReplayPieceShape.Figure && !booleanOf(attribute('hideName')),
    isConcealed: false,
    color: '',
    title: '',
    text: '',
    count: 0,
    openCells: [],
    tiled: false,
    elevation: 0,
    view: 3,
    door: null,
    sideImageIdentifier: '',
  };

  switch (shape) {
    case ReplayPieceShape.Card:
      return snapshot.aliasName === CARD_STACK_ALIAS
        ? readPile(piece, snapshot, reading)
        : readCard(piece, snapshot, reading);
    case ReplayPieceShape.Die: {
      const face = String(attribute('face') ?? '');
      const owner = String(attribute('owner') ?? '');
      const section = replayElementOfNamed(reading.childrenOf, snapshot.identifier, ['image']);
      const faces = reading.childrenOf.get(section?.identifier ?? '') ?? [];
      const shown = faces.find((one) => nameOf(one) === face) ?? faces[0];
      const isConcealed = owner.length > 0 && !canSeeOwned(owner, reading.viewer);
      return {
        ...piece,
        imageIdentifier: shown && !isConcealed ? String(shown.syncData['value'] ?? '') : '',
        text: isConcealed ? '' : face,
        isConcealed,
      };
    }
    case ReplayPieceShape.Coin:
      return { ...piece, imageIdentifier: image(attribute('face') === 'back' ? 'back' : 'front') };
    case ReplayPieceShape.Terrain: {
      const doorStyle = String(attribute('doorStyle') ?? '');
      return {
        ...piece,
        width: Math.max(0.25, numberOf(common('width'), 1)),
        height: Math.max(0.25, numberOf(common('depth'), 1)),
        imageIdentifier: image('top') || image('floor') || image('imageIdentifier'),
        sideImageIdentifier: image('south') || image('wall'),
        tiled: booleanOf(attribute('isTiledTexture')),
        elevation: Math.max(0, numberOf(common('height'), 1)),
        z: piece.z + numberOf(common('altitude')),
        view: numberOf(attribute('mode'), 3),
        door:
          doorStyle.length > 0 && doorStyle !== 'none'
            ? {
                style: doorStyle,
                open: booleanOf(attribute('isDoorOpen')),
                mirrored: booleanOf(attribute('doorMirrored')),
              }
            : null,
      };
    }
    case ReplayPieceShape.Light:
      return {
        ...piece,
        showsName: false,
        color: String(attribute('lightColor') ?? ''),
        isConcealed: !booleanOf(attribute('lightEnabled') ?? true),
      };
    case ReplayPieceShape.Mask:
      return {
        ...piece,
        width: Math.max(0.25, numberOf(common('width'), 1)),
        height: Math.max(0.25, numberOf(common('height'), 1)),
        color: maskColorOf(snapshot, reading),
        openCells: String(attribute('scratchedGrids') ?? '')
          .split(',')
          .filter((cell) => /^\d+:\d+$/.test(cell)),
      };
    case ReplayPieceShape.Note:
      return {
        ...piece,
        width: Math.max(0.25, numberOf(common('width'), 1)),
        height: Math.max(0.25, numberOf(common('height'), 1)),
        title: common('title'),
        text: common('text'),
      };
    default:
      return piece;
  }
}

function readCard(piece: ReplayBoardPiece, snapshot: ReplayObjectSnapshot, reading: PieceReading): ReplayBoardPiece {
  const faceUp = numberOf(syncValueOf(snapshot.syncData, 'state')) !== CARD_BACK_STATE;
  const image = (name: string): string => replayValueOfNamed(reading.childrenOf, snapshot.identifier, ['image', name]);
  return {
    ...piece,
    height: 0,
    imageIdentifier: faceUp ? image('front') : image('back'),
    text: faceUp ? replayValueOfNamed(reading.childrenOf, snapshot.identifier, ['common', 'text']) : '',
  };
}

function readPile(piece: ReplayBoardPiece, snapshot: ReplayObjectSnapshot, reading: PieceReading): ReplayBoardPiece {
  reading.cardsOf ??= cardsByPile(reading.snapshots);
  const cards = reading.cardsOf.get(snapshot.identifier) ?? [];
  const top = cards[0];
  if (!top) return { ...piece, height: 0, imageIdentifier: '', count: 0 };
  const card = readCard(piece, top, reading);
  const size = Math.max(0.25, numberOf(replayValueOfNamed(reading.childrenOf, top.identifier, ['common', 'size']), 2));
  return { ...card, size, width: size, count: cards.length };
}

/** The cards of every pile on the board, top card first as the pile orders them. */
function cardsByPile(snapshots: readonly ReplayObjectSnapshot[]): Map<string, ReplayObjectSnapshot[]> {
  const pileOfRoot = new Map<string, string>();
  for (const snapshot of snapshots) {
    if (nameOf(snapshot) !== CARD_ROOT_NAME) continue;
    pileOfRoot.set(snapshot.identifier, String(snapshot.syncData['parentIdentifier'] ?? ''));
  }
  const piles = new Map<string, ReplayObjectSnapshot[]>();
  for (const snapshot of snapshots) {
    if (snapshot.aliasName !== CARD_ALIAS) continue;
    const pile = pileOfRoot.get(String(snapshot.syncData['parentIdentifier'] ?? ''));
    if (!pile) continue;
    const cards = piles.get(pile);
    if (cards) cards.push(snapshot);
    else piles.set(pile, [snapshot]);
  }
  for (const cards of piles.values()) cards.sort((a, b) => indexOf(a) - indexOf(b));
  return piles;
}

/** A mask's fill, kept as the current value of its colour element, as the table draws it. */
function maskColorOf(snapshot: ReplayObjectSnapshot, reading: PieceReading): string {
  const color = replayElementOfNamed(reading.childrenOf, snapshot.identifier, ['common', 'color']);
  const current = color ? String(syncValueOf(color.syncData, 'currentValue') ?? '') : '';
  return current.length > 0 ? current : '#0a0a0a';
}

/** Whether a figure stands where the viewer could see it through the darkness, judged at its middle. */
function seenIn(
  darkness: NonNullable<ReturnType<typeof replayDarknessOf>>,
  piece: ReplayBoardPiece,
  table: ReplayObjectSnapshot
): boolean {
  const grid = Math.max(1, numberOf(syncValueOf(table.syncData, 'gridSize'), 50));
  const size = footprintOf(piece, grid);
  return darkness.sees(piece.x + size.width / 2, piece.y + size.height / 2);
}

/** Whether a viewer may see a piece kept to the game master or to chosen users. */
function canSeePiece(snapshot: ReplayObjectSnapshot, viewer: ReplayViewer): boolean {
  if (viewer.role === PeerRole.GameMaster) return true;
  const visibility = visibilityOfDisclosure(
    syncValueOf(snapshot.syncData, 'disclosureMode'),
    syncValueOf(snapshot.syncData, 'disclosureUserIds')
  );
  if (visibility.kind === 'public') return true;
  if (visibility.kind === 'gm-only') return false;
  return visibility.to.includes(viewer.userId);
}

/** Whether a viewer may read what a piece owned by someone shows: its owner can, and so can the game master. */
function canSeeOwned(owner: string, viewer: ReplayViewer | undefined): boolean {
  if (!viewer) return true;
  return viewer.role === PeerRole.GameMaster || viewer.userId === owner;
}

function nameOf(snapshot: ReplayObjectSnapshot): string {
  return String(syncValueOf(snapshot.syncData, 'name') ?? '');
}

function indexOf(snapshot: ReplayObjectSnapshot): number {
  return (
    numberOf(syncValueOf(snapshot.syncData, 'majorIndex')) + numberOf(syncValueOf(snapshot.syncData, 'minorIndex'))
  );
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
    const footprint = footprintOf(piece, scene.gridSize);
    left = Math.min(left, piece.x);
    top = Math.min(top, piece.y);
    right = Math.max(right, piece.x + footprint.width);
    bottom = Math.max(bottom, piece.y + footprint.height);
  }

  left = Math.max(whole.x, left - pad);
  top = Math.max(whole.y, top - pad);
  right = Math.min(whole.width, right + pad);
  bottom = Math.min(whole.height, bottom + pad);
  if (right - left < scene.gridSize || bottom - top < scene.gridSize) return whole;

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Cards stand half as tall again as they are wide when their picture is not to hand to say. */
export const REPLAY_CARD_ASPECT = 1.5;

/**
 * How much of the table a piece covers, in pixels. A card whose picture decides its height is
 * given the usual card shape.
 */
export function footprintOf(piece: ReplayBoardPiece, gridSize: number): { width: number; height: number } {
  const width = piece.width * gridSize;
  const height = piece.height > 0 ? piece.height * gridSize : width * REPLAY_CARD_ASPECT;
  return { width, height };
}

/** The pictures a board scene draws: the table, its background and every piece. Entries can be empty strings. */
export function collectBoardAssetIds(scene: ReplayBoardScene | null): string[] {
  if (!scene) return [];
  return [
    scene.imageIdentifier,
    scene.backgroundImageIdentifier,
    ...scene.pieces.map((piece) => piece.imageIdentifier),
    ...scene.pieces.map((piece) => piece.sideImageIdentifier),
  ];
}

function viewTableOf(snapshots: readonly ReplayObjectSnapshot[]): ReplayObjectSnapshot | null {
  const tables = snapshots.filter((snapshot) => snapshot.aliasName === TABLE_ALIAS);
  if (tables.length < 1) return null;

  const selecter = snapshots.find((snapshot) => snapshot.aliasName === SELECTER_ALIAS);
  const wanted = selecter ? String(syncValueOf(selecter.syncData, 'viewTableIdentifier') ?? '') : '';
  return tables.find((table) => table.identifier === wanted) ?? tables[0];
}

function booleanOf(value: unknown): boolean {
  return value === true || value === 'true';
}

function numberOf(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
