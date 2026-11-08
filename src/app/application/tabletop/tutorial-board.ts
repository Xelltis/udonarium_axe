import { type TranslateFn } from '@axe/application/i18n/translate.token';
import {
  bundledTerrainImage,
  dressDiceFaces,
  getDiceMenuItems,
} from '@axe/application/tabletop/tabletop-action-helpers';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { trackLazyLoad } from '@axe/core/util/lazy-loads';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { MAX_BOARD_PITCH, WhiteBoard } from '@axe/domain/tabletop/white-board';

/** How wide a cell of the first table is, in pixels. */
const CELL = 50;

/**
 * The row, in cells from the table's north edge, that the dice, the coin, the crate and the light lie
 * on, just inside the edge the board stands on.
 */
const EXHIBIT_ROW = 1;

/** The name the board the tutorial is written on is made under. */
const BOARD_IDENTIFIER = 'tutorialBoard';

/**
 * How large the board is, in cells: as wide as the first table, standing on its north edge, outside
 * the table, which leaves the table to the pieces; laid flat, as where the table is seen from above,
 * it lies back north of it.
 */
const BOARD_WIDTH = 32;
const BOARD_HEIGHT = 15;

/**
 * The note set out to be written on: lying in front of the board's part on the pieces, in the row
 * of things the board speaks of, placed by the middle of its lower edge.
 */
const DEMO_NOTE = { identifier: 'tutorialNote', x: 4, y: 3, width: 3.5, height: 2, fontSize: 5 };

/**
 * The dice set out in front of the board's part on the chat and dice, one of each of the kinds most
 * played with, by the name the table's menu makes them under, each in its cell: a cell apart, so
 * that the face each shows, written over it, does not run into the next one's. The coin, which shows
 * nothing over it, lies in the row in front of them, where a die's face would run into the marks over
 * the monsters behind it.
 */
const TUTORIAL_DICE = [
  { identifier: 'tutorialDice_1', kind: 'D4', cell: { x: 9, y: 1 } },
  { identifier: 'tutorialDice_2', kind: 'D6', cell: { x: 11, y: 1 } },
  { identifier: 'tutorialDice_3', kind: 'D8', cell: { x: 13, y: 1 } },
  { identifier: 'tutorialDice_4', kind: 'D20', cell: { x: 15, y: 1 } },
] as const;
const COIN_CELL = { x: 12, y: 3 };

/** The cells the crate, two cells across, and the light stand in, in front of the board's part for the game master. */
const CRATE_CELL = 25;
const LIGHT_CELL = 29;

/**
 * Puts up the board the tutorial is written on: standing on the table's north edge where the table is
 * seen in perspective, laid flat north of it where it is seen from above, and fixed, so a drag meant
 * for the table does not carry it off. What is written on it comes after, from the part that writes it.
 */
function putUpBoard(
  imageStorage: ImageStorage,
  table: GameTable,
  t: TranslateFn,
  standing: boolean,
  hold: (work: Promise<unknown>) => void
): void {
  const name = t('feature.tabletop.tutorial.board.name');
  const board = WhiteBoard.create(name, BOARD_WIDTH, BOARD_HEIGHT, 1, BOARD_IDENTIFIER);
  board.pitch = standing ? MAX_BOARD_PITCH : 0;
  board.location.x = 0;
  board.location.y = -BOARD_HEIGHT * CELL;
  board.posZ = 0;
  board.isLock = true;
  table.appendChild(board);
  board.update();
  hold(writeOnBoard(board, t, imageStorage));
}

/** The part the board is written by, once a board has asked for it; asked for again where it failed to come. */
let facesPart: Promise<typeof import('@axe/application/tabletop/tutorial-board-faces')> | null = null;

function loadFacesPart(): Promise<typeof import('@axe/application/tabletop/tutorial-board-faces')> {
  facesPart ??= trackLazyLoad(import('@axe/application/tabletop/tutorial-board-faces')).catch((error: unknown) => {
    facesPart = null;
    throw error;
  });
  return facesPart;
}

/**
 * Writes on the board and gives it the picture of what is written, from a part loaded only now: the
 * map editor's scene and renderer it is written and drawn with are needed nowhere else at the start.
 * Where no picture can be drawn, as in a browser with no canvas, the board keeps its plain face.
 */
async function writeOnBoard(board: WhiteBoard, t: TranslateFn, imageStorage: ImageStorage): Promise<void> {
  try {
    const { dressTutorialBoard } = await loadFacesPart();
    await dressTutorialBoard(board, t, imageStorage);
  } catch {
    return;
  }
}

/**
 * Lays the note that is there to be written on flat on the table, free to be clicked and rewritten,
 * which is what it says.
 */
function layDemoNote(t: TranslateFn): void {
  const note = TextNote.create(
    t('feature.tabletop.tutorial.note.title'),
    t('feature.tabletop.tutorial.note.text'),
    DEMO_NOTE.fontSize,
    DEMO_NOTE.width,
    DEMO_NOTE.height,
    DEMO_NOTE.identifier
  );
  note.location.x = DEMO_NOTE.x * CELL;
  note.location.y = DEMO_NOTE.y * CELL;
  note.posZ = 0;
  note.isUpright = false;
}

/** The dice and the coin set out in front of the board's part on them. */
function setOutDice(imageStorage: ImageStorage, t: TranslateFn): void {
  const kinds = getDiceMenuItems();
  for (const { identifier, kind: name, cell } of TUTORIAL_DICE) {
    const kind = kinds.find((each) => each.menuName === name)!;
    const die = DiceSymbol.create(kind.diceName, kind.type, 1, identifier);
    dressDiceFaces(die, kind.imagePathPrefix, imageStorage);
    die.location.x = cell.x * CELL;
    die.location.y = cell.y * CELL;
  }
  const coin = Coin.create(t('feature.tabletop.action.defaultCoinName'), 1, 'tutorialCoin');
  coin.location.x = COIN_CELL.x * CELL;
  coin.location.y = COIN_CELL.y * CELL;
}

/**
 * A low crate and a light set out in front of the board's part for the game master, each in a cell of
 * its own: the crate is kept to a cell high so it hides nothing of the board behind it.
 */
function setOutTerrainAndLight(imageStorage: ImageStorage, table: GameTable, t: TranslateFn): void {
  const image = bundledTerrainImage(imageStorage);
  const crate = Terrain.create(
    t('feature.tabletop.action.defaultTerrainName'),
    2,
    1,
    1,
    image.identifier,
    image.identifier,
    'tutorialCrate'
  );
  crate.location.x = CRATE_CELL * CELL;
  crate.location.y = EXHIBIT_ROW * CELL;
  crate.posZ = 0;
  table.appendChild(crate);

  const light = LightSource.create(t('feature.tabletop.action.defaultLightName'), 'tutorialLight');
  light.location.x = LIGHT_CELL * CELL;
  light.location.y = EXHIBIT_ROW * CELL;
  light.posZ = 0;
  table.appendChild(light);
  light.update();
}

/**
 * The names the tutorial's things are made under: the board, the note, the dice, the coin, the crate
 * and the light. The sample pieces are not among them, being there to be played with.
 */
export const TUTORIAL_PARTS: readonly string[] = [
  BOARD_IDENTIFIER,
  DEMO_NOTE.identifier,
  ...TUTORIAL_DICE.map((die) => die.identifier),
  'tutorialCoin',
  'tutorialCrate',
  'tutorialLight',
];

/** Whether an object is one of the tutorial's things, by the name it was made under. */
export function isTutorialPart(identifier: string): boolean {
  return TUTORIAL_PARTS.includes(identifier);
}

/**
 * Sets out what explains the first table, in the language shown: a board standing behind the pieces
 * with a welcome and a part on each part of the table, a note to try writing on, the dice and coin
 * the board's part on the chat speaks of, and the crate and light its part for the game master speaks
 * of. Where the table is seen from above, the board is laid flat instead.
 *
 * Each is made under a name of its own, as the sample pieces are, so two newcomers who meet each
 * with a first table of their own find one tutorial between them, not two. The writing of the board,
 * which comes after, is handed to `hold`, for whatever waits on the table to be ready to wait on it.
 */
export function layTutorialBoard(
  imageStorage: ImageStorage,
  table: GameTable,
  t: TranslateFn,
  standing: boolean,
  hold: (work: Promise<unknown>) => void = () => undefined
): void {
  putUpBoard(imageStorage, table, t, standing, hold);
  layDemoNote(t);
  setOutDice(imageStorage, t);
  setOutTerrainAndLight(imageStorage, table, t);
}
