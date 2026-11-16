import { expect, Locator, Page, test } from '@playwright/test';

import {
  cellSpot,
  closePanels,
  createCharacter,
  createCoin,
  createDiceSymbol,
  idle,
  openTableContextMenu,
  revealMenuEntry,
  rightClickAt,
  rightClickPiece,
  waitAppReady,
} from './helpers';
import {
  Box,
  boxesOf,
  createDeck,
  createLight,
  createMask,
  createNote,
  createRange,
  drawCard,
  idsOf,
  made,
  madeSince,
  openBoardAt,
  settled,
  takeAway,
} from './piece-helpers';

/**
 * Pieces and blocks on a table worked through picking alone, with nothing drawn on the canvas. The
 * page lays each piece out, clear, where the canvas would draw it, to take its presses, and picking
 * finds it by the shapes the canvas draws it with: so the shapes and the page's own parts have to
 * lie in the same place, and a press on them has to reach the piece.
 */

type Point = { x: number; y: number };

type Side = 'x' | 'y' | 'width' | 'height';

const ALL_SIDES: readonly Side[] = ['x', 'y', 'width', 'height'];

/** How far apart the page's box round a part of a piece and the box round the shape it is picked by may lie, in pixels. */
const BOX_SLACK_PX = 1.5;

/** The box on the page round an element of a piece, found by a selector under the piece. */
function laidOutBox(page: Page, tag: string, identifier: string, selector: string): Promise<Box> {
  return page.evaluate(
    ({ tag, identifier, selector }) => {
      const rect = document
        .querySelector(`${tag}[data-object-id="${identifier}"] ${selector}`)!
        .getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    },
    { tag, identifier, selector }
  );
}

/** Holds two boxes to lying in the same place, side by side, as far as the sides named. */
function expectSameBox(picked: Box, laidOut: Box, label: string, sides: readonly Side[] = ALL_SIDES) {
  for (const side of sides) {
    expect(
      Math.abs(picked[side] - laidOut[side]),
      `${label} ${side}: ${JSON.stringify([picked, laidOut])}`
    ).toBeLessThan(BOX_SLACK_PX);
  }
}

/** A part of a piece the page lays out, held against one of the shapes the piece is picked by. */
type LaidOutPart = {
  /** Which of the shapes, in the order the piece is drawn with them; -1 for the last. */
  shape: number;
  /** The element of the piece the page lays the part out as. */
  selector: string;
  /** The sides of the two boxes that have to agree, all four unless said. */
  sides?: readonly Side[];
};

/**
 * The kinds of piece picked by their shapes: what is set out before one is made, how it is made, how
 * many shapes it is picked by, which of the page's parts lie over which of them, what its menu holds,
 * and how it is taken off the table again, with what was set out for it.
 */
const PIECES: readonly {
  name: string;
  tag: string;
  prepare?: (page: Page) => Promise<void>;
  create: (page: Page) => Promise<void>;
  shapes: number;
  parts: readonly LaidOutPart[];
  menuEntry: string;
  takenAwayBy: string;
  leavesBehind?: { tag: string; takenAwayBy: string };
}[] = [
  {
    name: 'die',
    tag: 'dice-symbol',
    create: createDiceSymbol,
    shapes: 2,
    parts: [
      { shape: 0, selector: '[data-part="frame"]' },
      { shape: 1, selector: '[data-part="picture"]' },
    ],
    menuEntry: 'ダイス目を設定',
    takenAwayBy: '削除する',
  },
  {
    name: 'coin',
    tag: 'coin',
    create: createCoin,
    shapes: 1,
    // The shape is round the disc's top alone, the page's part round its rims top and bottom.
    parts: [{ shape: 0, selector: '[data-part="coin"]', sides: ['x', 'y', 'width'] }],
    menuEntry: 'コインを投げる',
    takenAwayBy: '削除する',
  },
  {
    name: 'card',
    tag: 'card',
    prepare: createDeck,
    create: drawCard,
    shapes: 1,
    parts: [{ shape: -1, selector: '[data-part="face"]' }],
    menuEntry: '手札に加える',
    takenAwayBy: '削除する',
    leavesBehind: { tag: 'card-stack', takenAwayBy: '山札を削除する' },
  },
  // A deck stands in 30 layers under its plate and its top card.
  {
    name: 'deck',
    tag: 'card-stack',
    create: createDeck,
    shapes: 32,
    parts: [{ shape: -1, selector: '[data-part="top"]' }],
    menuEntry: '１枚引く',
    takenAwayBy: '山札を削除する',
  },
  {
    name: 'note',
    tag: 'text-note',
    create: createNote,
    // A note is made standing up, picked by its panel and by its back.
    shapes: 2,
    parts: [{ shape: -1, selector: '.rounded-b-ui-sm' }],
    menuEntry: 'メモを編集',
    takenAwayBy: '削除する',
  },
  {
    name: 'mask',
    tag: 'game-table-mask',
    create: createMask,
    shapes: 1,
    parts: [{ shape: -1, selector: '[data-part="cover"]' }],
    menuEntry: 'スクラッチ開始',
    takenAwayBy: '削除する',
  },
  {
    name: 'range',
    tag: 'range',
    create: createRange,
    shapes: 1,
    parts: [{ shape: -1, selector: '[data-part="picture"]' }],
    menuEntry: '形状変更',
    takenAwayBy: '削除する',
  },
  {
    name: 'light',
    tag: 'light-source',
    create: createLight,
    shapes: 1,
    parts: [{ shape: -1, selector: '[data-part="mark"]' }],
    menuEntry: '光源設定…',
    takenAwayBy: '削除する',
  },
  {
    name: 'character',
    tag: 'game-character',
    create: createCharacter,
    shapes: 1,
    parts: [{ shape: -1, selector: '[data-part="pedestal"]' }],
    menuEntry: '詳細を表示',
    takenAwayBy: '墓場に移動',
  },
];

type Piece = (typeof PIECES)[number];

/**
 * Sets out what a kind of piece needs, makes one, hands it to the step given, and takes it and what
 * was set out for it off the table again, so the next kind is made on a clear board.
 */
async function withEach(page: Page, step: (piece: Piece, id: string) => Promise<void>) {
  for (const piece of PIECES) {
    const setOut = piece.leavesBehind ? await idsOf(page, piece.leavesBehind.tag) : [];
    await piece.prepare?.(page);
    const left = piece.leavesBehind ? await madeSince(page, piece.leavesBehind.tag, setOut) : null;
    const id = await made(page, piece);
    await step(piece, id);
    await takeAway(page, piece.tag, id, piece.takenAwayBy);
    if (left) await takeAway(page, piece.leavesBehind!.tag, left, piece.leavesBehind!.takenAwayBy);
    await idle(page);
  }
}

/**
 * The point picking finds a piece at nearest the middle of the first shape it is picked by, where the
 * page lays nothing but the table over it: a piece made beside a standing picture may be hidden in
 * part behind it.
 */
function pointPickedAs(page: Page, identifier: string): Promise<Point | null> {
  return page.evaluate((id) => {
    const hooks = window.__axeTable;
    const [shape] = hooks.pieceBoxesOnPage(id);
    if (!shape) return null;
    const middle = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
    let best: { x: number; y: number } | null = null;
    for (let y = Math.ceil(shape.y); y < shape.y + shape.height; y += 2) {
      for (let x = Math.ceil(shape.x); x < shape.x + shape.width; x += 2) {
        if (hooks.pickAt(x, y) !== id || document.elementFromPoint(x, y)?.closest('ui-panel')) continue;
        if (!best || Math.hypot(x - middle.x, y - middle.y) < Math.hypot(best.x - middle.x, best.y - middle.y)) {
          best = { x, y };
        }
      }
    }
    return best;
  }, identifier);
}

/**
 * A point of the open ground east of the sample pieces, as an offset into the table's layer, with
 * nothing standing near enough to cover what is made there or what comes out round it.
 */
function openGroundSpot(page: Page): Promise<{ x: number; y: number }> {
  return cellSpot(page, 25.5, 10);
}

/** Makes a die (D6) on the table at a point given as an offset into the table's layer. */
async function createDieAt(page: Page, spot: { x: number; y: number }) {
  const menu = await openTableContextMenu(page, spot);
  await (await revealMenuEntry(page, menu, 'ダイスを作成')).hover();
  await expect(menu.getByText('D6')).toBeVisible({ timeout: 5000 });
  await menu.getByText('D6').click();
  await expect(page.locator('dice-symbol').first()).toBeAttached({ timeout: 10000 });
}

/** Closes the context menu open now by a press beside it, as a reader does. */
async function closeMenu(page: Page) {
  await page.locator('#app-table-layer').dispatchEvent('mousedown');
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

test.describe('pieces picked by the shapes the canvas draws them with', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('lay each kind of piece’s parts out on the screen where picking finds them', async ({ page }) => {
    test.setTimeout(150_000);
    await withEach(page, async (piece, id) => {
      const boxes = await boxesOf(page, id);
      for (const part of piece.parts) {
        const picked = part.shape < 0 ? boxes.at(part.shape)! : boxes[part.shape];
        const laidOut = await laidOutBox(page, piece.tag, id, part.selector);
        expectSameBox(picked, laidOut, `${piece.name} ${part.selector}`, part.sides);
      }
    });

    const surfaces = () =>
      page
        .locator('white-board [data-surface]')
        .evaluateAll((faces) => faces.map((face) => face.getAttribute('data-surface')!));
    const boards = await surfaces();
    const menu = await openTableContextMenu(page, await openBoardAt(page));
    await (await revealMenuEntry(page, menu, 'ホワイトボードを作成')).click();
    let board: string | undefined;
    await expect
      .poll(async () => {
        board = (await surfaces()).find((surface) => !boards.includes(surface));
        return board;
      })
      .toBeTruthy();
    await idle(page);
    // A board standing up is picked by its face and by its back, the face first.
    await expect.poll(async () => (await boxesOf(page, board!)).length, { timeout: 10000 }).toBe(2);
    await idle(page);
    const boardFace = await page.evaluate((identifier) => {
      const rect = document
        .querySelector(`[data-surface="${identifier}"]`)!
        .parentElement!.querySelector('[data-part="face"]')!
        .getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, board!);
    expectSameBox((await boxesOf(page, board!))[0], boardFace, 'white board face');

    const character = page.locator('game-character', { has: page.getByText('キャラクターB', { exact: true }) });
    const standing = (await character.getAttribute('data-object-id'))!;
    await expect.poll(async () => (await boxesOf(page, standing)).length, { timeout: 10000 }).toBe(2);
    await settled(page, standing);
    const picture = await character.locator('img[data-part="picture"]').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expectSameBox((await boxesOf(page, standing))[1], picture, 'standing character picture');
  });

  test('open each kind of piece’s menu when it is right-clicked where picking finds it', async ({ page }) => {
    test.setTimeout(150_000);
    await withEach(page, async (piece, id) => {
      const at = await pointPickedAs(page, id);
      expect(at, `a point ${piece.name} is picked at`).not.toBeNull();

      await rightClickAt(page, at!);

      const menu = page.locator('context-menu');
      await expect(menu.locator('li').first(), piece.name).toBeVisible({ timeout: 5000 });
      await expect(menu.getByText(piece.menuEntry, { exact: true }), piece.name).toBeVisible();
      await closeMenu(page);
    });
  });

  test('take a range by its shape alone, not by the square round it', async ({ page }) => {
    await createRange(page);
    const id = (await page.locator('range').last().getAttribute('data-object-id'))!;
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(1);
    await idle(page);
    const [box] = await boxesOf(page, id);
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const pickAt = (point: Point) => page.evaluate(({ x, y }) => window.__axeTable.pickAt(x, y), point);

    expect(await pickAt(middle)).toBe(id);
    for (const [across, down] of [
      [-1, 1],
      [1, 1],
    ]) {
      const beside = { x: middle.x + across * box.width * 0.35, y: middle.y + down * box.height * 0.35 };
      expect(await pickAt(beside), JSON.stringify({ box, beside })).not.toBe(id);
    }
    await takeAway(page, 'range', id, '削除する');
  });

  test('move each kind of piece where it is dragged to while it is dragged, and leave it there', async ({ page }) => {
    test.setTimeout(150_000);
    await withEach(page, async (piece, id) => {
      const [shape] = await boxesOf(page, id);
      const grabX = shape.x + shape.width / 2;
      const grabY = shape.y + shape.height / 2;

      await page.mouse.move(grabX, grabY);
      await page.mouse.down();
      await page.mouse.move(grabX - 60, grabY + 20, { steps: 6 });
      await page.mouse.move(grabX - 120, grabY + 40, { steps: 6 });
      let moved = shape;
      await expect
        .poll(async () => {
          [moved] = await boxesOf(page, id);
          return shape.x - moved.x;
        })
        .toBeGreaterThan(60);
      await page.mouse.up();
      await idle(page);
      await settled(page, id);

      const [dropped] = await boxesOf(page, id);
      const off = Math.hypot(dropped.x - moved.x, dropped.y - moved.y);
      expect(off, `${piece.name}: ${JSON.stringify([shape, moved, dropped])}`).toBeLessThan(45);
      expect(shape.x - dropped.x, `${piece.name}: ${JSON.stringify([shape, dropped])}`).toBeGreaterThan(60);
    });
  });

  test('point at the card lying over another where they overlap, though the one under reaches nearer the eye', async ({
    page,
  }) => {
    const card = PIECES.find((piece) => piece.name === 'card')!;
    await card.prepare!(page);
    const under = await made(page, card);
    const over = await made(page, card);
    const [lying] = await boxesOf(page, under);
    const [drawn] = await boxesOf(page, over);
    const grabX = drawn.x + drawn.width / 2;
    const grabY = drawn.y + drawn.height / 2;
    const toX = lying.x + lying.width / 2;
    const toY = lying.y + lying.height / 2 - 60;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move((grabX + toX) / 2, (grabY + toY) / 2, { steps: 4 });
    await page.mouse.move(toX, toY, { steps: 4 });
    await page.mouse.up();
    await idle(page);
    await settled(page, over);
    await idle(page);

    const [lower] = await boxesOf(page, under);
    const [upper] = await boxesOf(page, over);
    expect(lower.y + lower.height, JSON.stringify([lower, upper])).toBeGreaterThan(upper.y + upper.height + 20);

    await expect
      .poll(async () => {
        const [bottom] = await boxesOf(page, under);
        const [top] = await boxesOf(page, over);
        const at = {
          x: (Math.max(bottom.x, top.x) + Math.min(bottom.x + bottom.width, top.x + top.width)) / 2,
          y: top.y + top.height - 10,
        };
        return page.evaluate(
          ({ x, y }) => ({
            picked: window.__axeTable.pickAt(x, y),
            pointed: document.elementFromPoint(x, y)?.closest('card')?.getAttribute('data-object-id') ?? null,
          }),
          at
        );
      })
      .toEqual({ picked: over, pointed: over });
  });

  test('tip a character’s picture over by a handle beside its top, about the middle of its cell', async ({ page }) => {
    const character = page.locator('game-character', { has: page.getByText('キャラクターB', { exact: true }) });
    const id = (await character.getAttribute('data-object-id'))!;
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(2);
    await settled(page, id);
    const [, upright] = await boxesOf(page, id);
    const middleOf = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

    const headBox = (await character.getByTestId('roll-grab-head').boundingBox())!;
    const report = JSON.stringify([headBox, upright]);
    expect(Math.abs(headBox.y - upright.y), report).toBeLessThan(10);
    expect(headBox.x, report).toBeGreaterThan(upright.x + upright.width - 6);
    await expect(character.getByTestId('roll-grab-foot')).toHaveCount(0);

    const grab = middleOf(headBox);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 10, grab.y + 40, { steps: 5 });
    await page.mouse.move(grab.x + 10, grab.y + 90, { steps: 5 });
    await page.mouse.up();
    await idle(page);

    const [, tipped] = await boxesOf(page, id);
    expect(tipped.width, JSON.stringify([upright, tipped])).toBeGreaterThan(upright.width * 1.3);
    expect(middleOf(tipped).x, JSON.stringify([upright, tipped])).toBeGreaterThan(middleOf(upright).x + 5);
  });

  test('guide a character raised off the floor down to the middle of its pedestal', async ({ page }) => {
    const character = page.locator('game-character', { has: page.getByText('モンスターA', { exact: true }) });
    const id = (await character.getAttribute('data-object-id'))!;
    await idle(page);
    await expect(character.getByTestId('altitude-guide')).toHaveCount(0);

    await rightClickPiece(character);
    const menu = page.locator('context-menu');
    await (await revealMenuEntry(page, menu, '高度設定')).hover();
    const altitude = menu.locator('input[name="altitude-number"]');
    await altitude.click();
    await altitude.press('Control+a');
    await altitude.pressSequentially('2');
    await closeMenu(page);
    await idle(page);

    const guide = character.getByTestId('altitude-guide');
    await expect(guide).toBeVisible({ timeout: 5000 });
    const [pedestal] = await boxesOf(page, id);
    const line = (await guide.boundingBox())!;
    const report = JSON.stringify([line, pedestal]);
    expect(Math.abs(line.x + line.width / 2 - (pedestal.x + pedestal.width / 2)), report).toBeLessThan(4);
    expect(Math.abs(line.y + line.height - (pedestal.y + pedestal.height / 2)), report).toBeLessThan(4);
    expect(line.height, report).toBeGreaterThan(pedestal.height);
    await expect(character.getByTestId('altitude-guide-altitude')).toHaveText('2');
    await expect(character.getByTestId('altitude-guide-elevation')).toHaveText('2');
  });

  test('stand a pole over a character held up off the floor, a rung a cell, for as long as it is held', async ({
    page,
  }) => {
    const character = page.locator('game-character', { has: page.getByText('キャラクターB', { exact: true }) });
    const id = (await character.getAttribute('data-object-id'))!;
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(2);
    await settled(page, id);
    const [pedestal] = await boxesOf(page, id);
    const grab = { x: pedestal.x + pedestal.width / 2, y: pedestal.y + pedestal.height / 2 };
    const hud = page.getByTestId('table-hud');

    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 4, grab.y + 4, { steps: 3 });
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -100);
    await page.mouse.wheel(0, -100);

    await expect(hud.locator('[data-altitude-guide-rung]')).toHaveCount(2, { timeout: 5000 });
    await expect(hud.locator('[data-altitude-guide-reading]')).toHaveText('+2');
    const poleBox = async () => (await hud.locator('[data-altitude-guide-pole]').boundingBox())!;
    await expect.poll(async () => (await poleBox()).height, { timeout: 5000 }).toBeGreaterThan(pedestal.height);
    const pole = await poleBox();
    const report = JSON.stringify([pole, pedestal]);
    expect(Math.abs(pole.x + pole.width / 2 - (grab.x + 4)), report).toBeLessThan(pedestal.width / 2);
    expect(pole.y + pole.height, report).toBeGreaterThan(pedestal.y);
    const ground = (await hud.locator('[data-altitude-guide-ground]').boundingBox())!;
    const onGround = JSON.stringify([ground, pedestal]);
    expect(Math.abs(ground.x + ground.width / 2 - (pedestal.x + pedestal.width / 2 + 4)), onGround).toBeLessThan(8);
    expect(Math.abs(ground.y + ground.height / 2 - (pedestal.y + pedestal.height / 2 + 4)), onGround).toBeLessThan(8);

    await page.keyboard.up('Shift');
    await page.mouse.up();
    await expect(hud.locator('[data-altitude-guide]')).toHaveCount(0);
  });

  test('turn a die, and then a block, by dragging a knob of the frame that comes out round its foot', async ({
    page,
  }) => {
    const die = await made(page, {
      ...PIECES[0],
      create: async (onPage) => createDieAt(onPage, await openGroundSpot(onPage)),
    });
    const [before] = await boxesOf(page, die);
    const middle = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await page.mouse.move(middle.x, middle.y);
    const knob = page.locator(`dice-symbol[data-object-id="${die}"] [data-testid="turn-frame-knob"]`).nth(2);
    await turnAnEighthBy(page, knob, middle);

    await expect.poll(async () => (await boxesOf(page, die))[0].width / before.width).toBeGreaterThan(1.2);
    await takeAway(page, PIECES[0].tag, die, PIECES[0].takenAwayBy);

    const menu = await openTableContextMenu(page, await openGroundSpot(page));
    await (await revealMenuEntry(page, menu, '地形を作成')).click();
    const block = page.locator('terrain').last();
    const top = block.locator('[data-part="top"]');
    await expect(top).toBeVisible({ timeout: 10000 });
    await idle(page);
    const square = (await top.boundingBox())!;
    const centre = { x: square.x + square.width / 2, y: square.y + square.height / 2 };
    await page.mouse.move(centre.x, centre.y);
    await turnAnEighthBy(page, block.locator('[data-testid="turn-frame-knob"]').nth(2), centre);

    await expect.poll(async () => (await top.boundingBox())!.width / square.width).toBeGreaterThan(1.15);
  });
});

/**
 * Turns a piece an eighth of a turn round its middle by the knob given, which comes out with the
 * pointer over the piece: a square shows the turn by growing its box.
 */
async function turnAnEighthBy(page: Page, knob: Locator, middle: Point) {
  await expect(knob).toBeVisible({ timeout: 5000 });
  const grab = (await knob.boundingBox())!;
  const from = { x: grab.x + grab.width / 2, y: grab.y + grab.height / 2 };
  const reach = Math.hypot(from.x - middle.x, from.y - middle.y);
  const start = Math.atan2(from.y - middle.y, from.x - middle.x);
  await page.mouse.move(from.x, from.y, { steps: 4 });
  await page.mouse.down();
  for (const step of [1, 2, 3]) {
    const turn = start + (step / 3) * (Math.PI / 4);
    await page.mouse.move(middle.x + Math.cos(turn) * reach, middle.y + Math.sin(turn) * reach, { steps: 4 });
  }
  await page.mouse.up();
}
