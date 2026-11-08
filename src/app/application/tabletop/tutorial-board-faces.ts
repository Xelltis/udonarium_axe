import { type TranslateFn } from '@axe/application/i18n/translate.token';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  createLayer,
  createScene,
  type MapScene,
  type ShapeItem,
  type ShapeLayer,
  type TextItem,
  type TextLayer,
} from '@axe/domain/map-editor/scene';
import { guessLineWidth } from '@axe/domain/map-editor/scene-geometry';
import { serializeScene } from '@axe/domain/map-editor/serialize';
import { layoutReplayText } from '@axe/domain/replay/video/replay-text-layout';
import { GridType } from '@axe/domain/tabletop/game-table';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { exportSceneToBlob } from '@axe/infrastructure/map-editor/export-image';

/** What a part of the tutorial board says: the welcome, or one part of the table. */
export type TutorialFace = 'welcome' | 'pieces' | 'chat' | 'battle' | 'vision';

/** A part of the tutorial board: what it says, and where it runs across the board, in cells. */
export interface TutorialPanel {
  readonly face: TutorialFace;
  readonly from: number;
  readonly to: number;
}

/**
 * The parts the board is set out in: the welcome across the top, with how the view is moved, and
 * under it the four parts of the table side by side, in the order they are read. Their foot is the
 * board's, so the dice and the coin lie in front of the chat's part, and the crate and the light in
 * front of the game master's.
 */
export const TUTORIAL_PANELS: readonly TutorialPanel[] = [
  { face: 'welcome', from: 0.25, to: 31.75 },
  { face: 'pieces', from: 0.25, to: 7.9375 },
  { face: 'chat', from: 8.1875, to: 15.875 },
  { face: 'battle', from: 16.125, to: 23.8125 },
  { face: 'vision', from: 24.0625, to: 31.75 },
];

/** How wide a cell of the first table is, in pixels. */
const CELL = 50;

/** How much finer than a cell to a pixel the board's picture is drawn, so its words stay sharp up close. */
const BOARD_PICTURE_SCALE = 2;

/** The smallest the board's words are shrunk to, to fit a language whose words run long. */
const MIN_BOARD_FONT = 10;

/** The largest the words in the parts are written, where they fit. */
const LARGEST_BODY_FONT = 24;

/** The ink the board is written in. */
const INK = '#23324a';
const SOFT_INK = '#3d4656';

/** The colour each part is headed with, so the board reads as its parts. */
const PANEL_COLOURS: Record<TutorialFace, string> = {
  welcome: INK,
  pieces: '#2f5d8a',
  chat: '#2b766c',
  battle: '#9a4036',
  vision: '#5b4a8a',
};

/** How far the words keep off the edges of the board and of each part. */
const MARGIN = 12;

/** A run of words on the board, in its ink, at a point of the sheet. */
function words(
  id: string,
  x: number,
  y: number,
  text: string,
  fontSize: number,
  more: Partial<TextItem> = {}
): TextItem {
  return { id, x, y, text, fontSize, color: SOFT_INK, bold: false, italic: false, align: 'left', ...more };
}

/** A rectangle drawn on the board. */
function box(id: string, x: number, y: number, width: number, height: number, fill: string, stroke = ''): ShapeItem {
  return {
    id,
    shape: 'rect',
    points: [x, y, width, height],
    fill: { type: 'solid', color: fill },
    stroke: stroke ? { color: stroke, width: 2 } : null,
    rotation: 0,
  };
}

/**
 * Lines of words broken to fit a width at a size, as a subtitle is: Japanese between characters but
 * not before a stop or after an opening bracket, other languages at spaces. A stop the rule keeps off
 * the start of a line is hung on the end of the one before, so the lines are broken a character short
 * of the width for that one to stay on the board. The words are measured by estimate, as the board
 * is written where nothing can measure them yet.
 */
function wrapped(text: string, fontSize: number, room: number): string[] {
  const measure = (line: string) => guessLineWidth(line, fontSize);
  return layoutReplayText(text, measure, room - fontSize, Number.MAX_SAFE_INTEGER)[0].lines;
}

/**
 * The size its words are written at for the widest line among them to fit the room: the size asked
 * for where they fit, and smaller, though never below {@link MIN_BOARD_FONT}, where they would not.
 */
function fittingSize(texts: readonly string[], fontSize: number, room: number): number {
  const widest = Math.max(...texts.flatMap((text) => text.split('\n')).map((line) => guessLineWidth(line, fontSize)));
  if (widest <= room) return fontSize;
  return Math.max(MIN_BOARD_FONT, Math.floor((fontSize * room) / widest));
}

/** A blank sheet of the board's size, with no grid and nothing painted under what is written on it. */
function blankSheet(
  widthCells: number,
  heightCells: number
): { scene: MapScene; shapes: ShapeLayer; texts: TextLayer } {
  const scene = createScene(widthCells, heightCells, CELL, GridType.SQUARE);
  scene.gridVisible = false;
  scene.background = 'transparent';
  const shapes = createLayer('shape', 'shape') as ShapeLayer;
  const texts = createLayer('text', 'text') as TextLayer;
  scene.layers.push(shapes, texts);
  return { scene, shapes, texts };
}

/** Where a part is written on the sheet: its left edge, its width, and the top of the room under its heading. */
interface PanelRoom {
  readonly left: number;
  readonly width: number;
  readonly top: number;
}

/**
 * Writes the welcome's part in two columns: on the left how the view is moved and a menu opened with
 * a mouse and with fingers, set out as a table of the two; on the right where to read on, how to play
 * with others and how to clear the table. Answers how far down the part its words run.
 */
function writeWelcome(
  t: TranslateFn,
  shapes: ShapeLayer,
  texts: TextLayer,
  panel: PanelRoom,
  fontSize: number
): number {
  const gutter = MARGIN * 3;
  const column = (panel.width - MARGIN * 2 - gutter) / 2;
  const tableEnd = writeControls(
    t,
    shapes,
    texts,
    { left: panel.left, width: column + MARGIN * 2, top: panel.top },
    fontSize
  );
  const notesEnd = writeNotes(
    t,
    texts,
    { left: panel.left + column + gutter, width: column + MARGIN * 2, top: panel.top },
    fontSize
  );
  return Math.max(tableEnd, notesEnd);
}

/**
 * Writes how the view is moved and a menu opened, as a table of the mouse and of fingers, as large as
 * it fits the room. Answers how far down its words run.
 */
function writeControls(
  t: TranslateFn,
  shapes: ShapeLayer,
  texts: TextLayer,
  panel: PanelRoom,
  fontSize: number
): number {
  const key = (name: string): string => t(`feature.tabletop.tutorial.board.${name}`);
  const left = panel.left + MARGIN;
  const room = panel.width - MARGIN * 2;
  const y = panel.top;

  const actions = ['pan', 'turn', 'zoom', 'menu'];
  const cells = [
    ['', key('mouse'), key('touch')],
    ...actions.map((action) => [key(action), key(`${action}Mouse`), key(`${action}Touch`)]),
  ];
  const pad = 8;
  const gap = 12;
  const askedWidths = [0, 1, 2].map((column) =>
    Math.max(...cells.map((line) => guessLineWidth(line[column], fontSize)))
  );
  const tableRoom = room - pad * 2 - gap * 2;
  const askedTotal = askedWidths.reduce((sum, wide) => sum + wide, 0);
  const tableSize =
    askedTotal <= tableRoom ? fontSize : Math.max(MIN_BOARD_FONT, Math.floor((fontSize * tableRoom) / askedTotal));
  const columnWidths = askedWidths.map((wide) => (wide * tableSize) / fontSize);
  const columnX = [
    left + pad,
    left + pad + columnWidths[0] + gap,
    left + pad + columnWidths[0] + columnWidths[1] + gap * 2,
  ];
  const row = Math.round(tableSize * 1.6);
  shapes.items.push(box('welcome-controls', left, y - 6, room, row * cells.length + 2, '#ffffffcc', '#23324a40'));
  cells.forEach((line, index) => {
    line.forEach((text, column) => {
      if (!text) return;
      const heading = index === 0 || column === 0;
      texts.items.push(
        words(`welcome-cell-${index}-${column}`, columnX[column], y + row * index, text, tableSize, {
          color: heading ? INK : SOFT_INK,
          bold: heading,
        })
      );
    });
  });
  return y + row * cells.length;
}

/**
 * Writes where to read on, how to play with others and how to clear the table, a paragraph to each,
 * broken to the width of the room. Answers how far down its words run.
 */
function writeNotes(t: TranslateFn, texts: TextLayer, panel: PanelRoom, fontSize: number): number {
  const left = panel.left + MARGIN;
  const room = panel.width - MARGIN * 2;
  let y = panel.top;
  for (const [name, ink] of [
    ['footer', SOFT_INK],
    ['rooms', INK],
    ['tidy', INK],
  ] as const) {
    const lines = t(`feature.tabletop.tutorial.board.${name}`)
      .split('\n')
      .flatMap((line) => wrapped(line, fontSize, room))
      .join('\n');
    texts.items.push(words(`welcome-${name}`, left, y, lines, fontSize, { color: ink }));
    y += lines.split('\n').length * fontSize * 1.2 + fontSize * 0.7;
  }
  return y - fontSize * 0.7;
}

/**
 * Writes the part on one part of the table: the lines of its text, a list item to a dot and the rest
 * as they are, each broken to the width of the part. Answers how far down the part its words run.
 */
function writeTopic(
  t: TranslateFn,
  topic: Exclude<TutorialFace, 'welcome'>,
  shapes: ShapeLayer,
  texts: TextLayer,
  panel: PanelRoom,
  fontSize: number
): number {
  const left = panel.left + MARGIN;
  const room = panel.width - MARGIN * 2;
  const bullet = fontSize * 0.42;
  const indent = left + bullet + 7;
  let y = panel.top;
  const lines = t(`feature.tabletop.tutorial.${topic}.text`)
    .split('\n')
    .filter((line) => line.trim().length > 0);
  lines.forEach((line, index) => {
    const listed = line.startsWith('- ');
    const text = listed ? line.slice(2) : line;
    const broken = wrapped(text, fontSize, listed ? room - (indent - left) : room);
    if (listed) {
      shapes.items.push({
        id: `${topic}-dot-${index}`,
        shape: 'ellipse',
        points: [left, y + fontSize * 0.6 - bullet / 2, bullet, bullet],
        fill: { type: 'solid', color: PANEL_COLOURS[topic] },
        stroke: null,
        rotation: 0,
      });
    }
    texts.items.push(
      words(`${topic}-line-${index}`, listed ? indent : left, y, broken.join('\n'), fontSize, {
        color: listed ? INK : SOFT_INK,
      })
    );
    y += broken.length * fontSize * 1.2 + fontSize * 0.55;
  });
  return y;
}

/** The heading a part is written under: the welcome's name, or the title of its part of the table. */
function panelTitle(t: TranslateFn, face: TutorialFace): string {
  return face === 'welcome' ? t('feature.tabletop.tutorial.board.name') : t(`feature.tabletop.tutorial.${face}.title`);
}

/**
 * Draws a part's ground and its heading band, and writes its heading. Answers its ground, so its foot
 * can be set once what is written in it is known.
 */
function framePanel(
  t: TranslateFn,
  shapes: ShapeLayer,
  texts: TextLayer,
  panel: TutorialPanel,
  top: number,
  head: number,
  headSize: number
): ShapeItem {
  const left = panel.from * CELL;
  const width = (panel.to - panel.from) * CELL;
  const colour = PANEL_COLOURS[panel.face];
  const ground = box(`${panel.face}-panel`, left, top, width, head, `${colour}12`, `${colour}55`);
  shapes.items.push(ground, box(`${panel.face}-head`, left, top, width, head, colour));
  texts.items.push(
    words(`${panel.face}-title`, left + MARGIN, top + 8, panelTitle(t, panel.face), headSize, {
      color: '#ffffff',
      bold: true,
    })
  );
  return ground;
}

/**
 * Writes the whole board at one size of its words: the title across the top, the welcome under it,
 * and the four parts of the table under that, down to the board's foot. Answers whether every part's
 * words end above the board's foot.
 */
function writeBoard(
  t: TranslateFn,
  widthCells: number,
  heightCells: number,
  fontSize: number
): { scene: MapScene; fits: boolean } {
  const { scene, shapes, texts } = blankSheet(widthCells, heightCells);
  const width = widthCells * CELL;
  const height = heightCells * CELL;

  const title = t('feature.tabletop.tutorial.board.title');
  const titleSize = fittingSize([title], 40, width - MARGIN * 2);
  const band = Math.round(titleSize * 1.25 + 22);
  shapes.items.push(box('title-band', 0, 0, width, band, '#23324a14'));
  texts.items.push(words('title', width / 2, 11, title, titleSize, { color: INK, bold: true, align: 'center' }));

  const headSize = Math.min(
    ...TUTORIAL_PANELS.map((panel) =>
      fittingSize([panelTitle(t, panel.face)], Math.round(fontSize * 1.2), (panel.to - panel.from) * CELL - MARGIN * 2)
    )
  );
  const head = Math.round(headSize * 1.2 + 16);
  const [welcome, ...topics] = TUTORIAL_PANELS;

  const welcomeTop = band + MARGIN;
  const welcomeGround = framePanel(t, shapes, texts, welcome, welcomeTop, head, headSize);
  const welcomeEnd = writeWelcome(
    t,
    shapes,
    texts,
    { left: welcome.from * CELL, width: (welcome.to - welcome.from) * CELL, top: welcomeTop + head + 14 },
    fontSize
  );
  welcomeGround.points[3] = welcomeEnd + 14 - welcomeTop;

  const top = welcomeEnd + 14 + MARGIN;
  const foot = height - MARGIN;
  let fits = true;
  for (const panel of topics) {
    const ground = framePanel(t, shapes, texts, panel, top, head, headSize);
    ground.points[3] = foot - top;
    const end = writeTopic(
      t,
      panel.face as Exclude<TutorialFace, 'welcome'>,
      shapes,
      texts,
      { left: panel.from * CELL, width: (panel.to - panel.from) * CELL, top: top + head + 14 },
      fontSize
    );
    if (end > foot - 6) fits = false;
  }
  return { scene, fits };
}

/**
 * What the tutorial board says, on a board so many cells across and deep: a welcome across its top,
 * with how the view is moved beside where to read on, and under it a part on each part of the table,
 * side by side. The words of the parts are written at one size, as large as lets every part fit in
 * the language shown.
 */
export function tutorialScene(t: TranslateFn, widthCells: number, heightCells: number): MapScene {
  for (let size = LARGEST_BODY_FONT; ; size--) {
    const written = writeBoard(t, widthCells, heightCells, size);
    if (written.fits || size <= MIN_BOARD_FONT) return written.scene;
  }
}

/** Whether the board is still the one the store holds under its name, and not one taken away or put in its place. */
function stillUp(board: WhiteBoard): boolean {
  return ObjectStore.instance.get(board.identifier) === board;
}

/**
 * Writes on the tutorial board, and gives the board the picture of it, which is what a board shows
 * on the table, as the board's own editor does on saving it. A board taken off the table meanwhile,
 * as by going into a room, is left alone, and no picture of it is kept. Where no picture can be drawn, as in a browser with no
 * canvas, this rejects with the words written and the board's plain face left as it was.
 */
export async function dressTutorialBoard(board: WhiteBoard, t: TranslateFn, imageStorage: ImageStorage): Promise<void> {
  if (!stillUp(board)) return;
  const scene = tutorialScene(t, board.width, board.height);
  board.scene = serializeScene(scene);
  board.update();
  const blob = await exportSceneToBlob(scene, [], { scale: BOARD_PICTURE_SCALE });
  if (!stillUp(board)) return;
  const file = await imageStorage.addAsync(blob);
  const element = board.imageDataElement?.getFirstElementByName('imageIdentifier');
  if (!file || !element || !stillUp(board)) return;
  element.value = file.identifier;
  board.update();
}
