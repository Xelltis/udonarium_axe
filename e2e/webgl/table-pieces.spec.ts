import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import {
  cellSpot,
  createCharacter,
  createDiceSymbol,
  openPanel,
  openTableContextMenu,
  revealMenuEntry,
  waitAppReady,
} from '../helpers';

/**
 * Pieces drawn on the canvas. The page still lays each piece out, clear, to take its presses, so
 * the canvas has to draw a piece exactly where the page lays it out, and picking has to find it
 * there too.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
  moving(identifier: string): boolean;
  edgesOnPage(): [number, number, number, number][];
  whenIdle(): Promise<void>;
  pickAt(x: number, y: number): string | null;
  aliasOf(identifier: string): string | null;
  pieceBoxesOnPage(identifier: string): Box[];
};

/** How far apart the page's box round a part of a piece and the canvas's may lie, in pixels. */
const BOX_SLACK_PX = 1.5;
/** How near an edge of a piece's box a point may lie and be left out, in pixels. */
const EDGE_SLACK_PX = 3;
const STEP_PX = 3;

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

function boxesOf(page: Page, identifier: string): Promise<Box[]> {
  return page.evaluate(
    (id) => (window as unknown as { __axeTable: Hooks }).__axeTable.pieceBoxesOnPage(id),
    identifier
  );
}

/** A picture of the screen, read into the page so its colours can be looked up there. */
async function grabScreen(page: Page): Promise<void> {
  const shot = await page.screenshot({ scale: 'css' });
  await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const kept = (window as unknown as { __shots?: ImageData[] }).__shots ?? [];
    kept.push(canvas.getContext('2d')!.getImageData(0, 0, image.width, image.height));
    (window as unknown as { __shots: ImageData[] }).__shots = kept;
  }, shot.toString('base64'));
}

/**
 * Waits for a piece's animations, such as the bounce it comes onto the table with, to finish: the
 * page's, and the moves the canvas plays itself.
 */
async function settled(page: Page, identifier: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          document
            .querySelector(`[data-object-id="${id}"]`)!
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length +
          ((window as unknown as { __axeTable: Hooks }).__axeTable.moving(id) ? 1 : 0),
        identifier
      )
    )
    .toBe(0);
}

/** The piece made last with a tag, and its identifier. */
async function newest(page: Page, tag: string): Promise<string> {
  const piece = page.locator(tag).last();
  await expect(piece).toBeAttached();
  return (await piece.getAttribute('data-object-id'))!;
}

/**
 * A point of the bare board south of the sample pieces, as an offset into the table's layer, with
 * room to its right for a card drawn off a deck and for a white board to lie on the screen whole.
 */
function openBoardAt(page: Page): Promise<{ x: number; y: number }> {
  return cellSpot(page, 13.5, 16.5);
}

async function createCoin(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'コインを作成')).click();
  await expect(page.locator('coin').first()).toBeAttached({ timeout: 10000 });
}

async function createDeck(page: Page) {
  const before = await page.locator('card-stack').count();
  const menu = await openTableContextMenu(page, await openBoardAt(page));
  await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack')).toHaveCount(before + 1, { timeout: 10000 });
  await page.mouse.move(5, 400);
  await expect(page.locator('overview-panel')).toHaveCount(0, { timeout: 5000 });
}

/** Draws a card off the deck made last, which lays it a little way off the deck. */
async function drawCard(page: Page) {
  const before = await page.locator('card').count();
  await page.locator('card-stack').last().dispatchEvent('contextmenu');
  await page.locator('context-menu').getByText('１枚引く').click();
  await expect(page.locator('card')).toHaveCount(before + 1, { timeout: 5000 });
  await page.mouse.move(5, 400);
}

async function createNote(page: Page) {
  const before = await page.locator('text-note').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '共有メモを作成')).click();
  await expect(page.locator('text-note')).toHaveCount(before + 1, { timeout: 10000 });
}

async function createMask(page: Page) {
  const before = await page.locator('game-table-mask').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'マップマスクを作成')).click();
  await expect(page.locator('game-table-mask')).toHaveCount(before + 1, { timeout: 10000 });
}

async function createRange(page: Page) {
  const before = await page.locator('range').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '射程範囲を作成')).hover();
  await expect(menu.getByText('円形', { exact: true })).toBeVisible({ timeout: 5000 });
  await menu.getByText('円形', { exact: true }).click();
  await expect(page.locator('range')).toHaveCount(before + 1, { timeout: 10000 });
}

async function createLight(page: Page) {
  const before = await page.locator('light-source').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '光源を作成')).click();
  await expect(page.locator('light-source')).toHaveCount(before + 1, { timeout: 10000 });
}

/**
 * The kinds of piece drawn on the canvas: what is set out before one is made, how it is made, how
 * many shapes it is drawn with and what its menu holds.
 */
const PIECES: readonly {
  name: string;
  tag: string;
  prepare?: (page: Page) => Promise<void>;
  create: (page: Page) => Promise<void>;
  shapes: number;
  menuEntry: string;
  /** Whether it lights the table round it, which changes the screen beyond where it is drawn. */
  lights?: boolean;
}[] = [
  { name: 'die', tag: 'dice-symbol', create: createDiceSymbol, shapes: 2, menuEntry: 'ダイス目を設定' },
  { name: 'coin', tag: 'coin', create: createCoin, shapes: 1, menuEntry: 'コインを投げる' },
  { name: 'card', tag: 'card', prepare: createDeck, create: drawCard, shapes: 1, menuEntry: '手札に加える' },
  // A deck stands in 30 layers under its plate and its top card.
  { name: 'deck', tag: 'card-stack', create: createDeck, shapes: 32, menuEntry: '１枚引く' },
  { name: 'note', tag: 'text-note', create: createNote, shapes: 1, menuEntry: 'メモを編集' },
  { name: 'mask', tag: 'game-table-mask', create: createMask, shapes: 1, menuEntry: 'スクラッチ開始' },
  { name: 'range', tag: 'range', create: createRange, shapes: 1, menuEntry: '形状変更' },
  { name: 'light', tag: 'light-source', create: createLight, shapes: 1, menuEntry: '光源設定…', lights: true },
  { name: 'character', tag: 'game-character', create: createCharacter, shapes: 1, menuEntry: '詳細を表示' },
];

/** Makes a piece and waits until the canvas draws it and its animations are over, and answers its identifier. */
async function made(page: Page, piece: (typeof PIECES)[number]): Promise<string> {
  await piece.create(page);
  const id = await newest(page, piece.tag);
  await idle(page);
  await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(piece.shapes);
  await settled(page, id);
  await idle(page);
  return id;
}

test.describe('pieces drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('box a die’s frame and picture on the screen where the canvas draws them', async ({ page }) => {
    const id = await made(page, PIECES[0]);

    const [frame, picture] = await boxesOf(page, id);
    const laidOut = await page.evaluate((identifier) => {
      const die = document.querySelector(`dice-symbol[data-object-id="${identifier}"]`)!;
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      return {
        frame: box(die.querySelector('[data-part="frame"]')!),
        picture: box(die.querySelector('[data-part="picture"]')!),
      };
    }, id);

    for (const [part, drawn, page] of [
      ['frame', frame, laidOut.frame],
      ['picture', picture, laidOut.picture],
    ] as const) {
      for (const side of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(drawn[side] - page[side]), `${part} ${side}: ${JSON.stringify([drawn, page])}`).toBeLessThan(
          BOX_SLACK_PX
        );
      }
    }
  });

  test('box a coin on the screen where the canvas draws it', async ({ page }) => {
    const id = await made(page, PIECES[1]);

    const [side] = await boxesOf(page, id);
    const laidOut = await page.evaluate((identifier) => {
      const rect = document
        .querySelector(`coin[data-object-id="${identifier}"] [data-part="coin"]`)!
        .getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, id);

    // The canvas's box is round the disc's top alone, the screen's round its rims top and bottom.
    for (const edge of ['x', 'y'] as const) {
      expect(Math.abs(side[edge] - laidOut[edge]), JSON.stringify([side, laidOut])).toBeLessThan(BOX_SLACK_PX);
    }
    expect(Math.abs(side.width - laidOut.width), JSON.stringify([side, laidOut])).toBeLessThan(BOX_SLACK_PX);
  });

  for (const [piece, part] of [
    [PIECES[2], '[data-part="face"]'],
    [PIECES[3], '[data-part="top"]'],
    [PIECES[4], '.rounded-b-ui-sm'],
    [PIECES[5], '[data-part="cover"]'],
    [PIECES[6], '[data-part="picture"]'],
    [PIECES[7], '[data-part="mark"]'],
    [PIECES[8], '[data-part="pedestal"]'],
  ] as const) {
    test(`lay a ${piece.name}’s picture where the page lays it out`, async ({ page }) => {
      await piece.prepare?.(page);
      const id = await made(page, piece);

      const drawn = (await boxesOf(page, id)).at(-1)!;
      const laidOut = await page.evaluate(
        ({ tag, identifier, selector }) => {
          const rect = document
            .querySelector(`${tag}[data-object-id="${identifier}"] ${selector}`)!
            .getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        },
        { tag: piece.tag, identifier: id, selector: part }
      );

      for (const side of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(drawn[side] - laidOut[side]), `${side}: ${JSON.stringify([drawn, laidOut])}`).toBeLessThan(
          BOX_SLACK_PX
        );
      }
    });
  }

  test('lay a white board’s face where the page lays it out', async ({ page }) => {
    const menu = await openTableContextMenu(page, await openBoardAt(page));
    await (await revealMenuEntry(page, menu, 'ホワイトボードを作成')).click();
    const face = page.locator('white-board [data-surface]').last();
    await expect(face).toBeAttached({ timeout: 10000 });
    const id = (await face.getAttribute('data-surface'))!;
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(1);
    await idle(page);

    const [drawn] = await boxesOf(page, id);
    const laidOut = await page.evaluate((identifier) => {
      const rect = document
        .querySelector(`[data-surface="${identifier}"]`)!
        .parentElement!.querySelector('[data-part="face"]')!
        .getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, id);

    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(drawn[side] - laidOut[side]), `${side}: ${JSON.stringify([drawn, laidOut])}`).toBeLessThan(
        BOX_SLACK_PX
      );
    }
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
    // Onto the card under it, a cell or so up the screen, so that the one under reaches further down.
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
    const at = {
      x: (Math.max(lower.x, upper.x) + Math.min(lower.x + lower.width, upper.x + upper.width)) / 2,
      y: upper.y + upper.height - 10,
    };
    const found = await page.evaluate(
      ({ x, y }) => ({
        picked: (window as unknown as { __axeTable: Hooks }).__axeTable.pickAt(x, y),
        pointed: document.elementFromPoint(x, y)?.closest('card')?.getAttribute('data-object-id') ?? null,
      }),
      at
    );

    expect(found).toEqual({ picked: over, pointed: over });
  });

  test('stand a character’s picture where the page stands it', async ({ page }) => {
    const character = page.locator('game-character', { has: page.getByText('キャラクターB', { exact: true }) });
    const id = (await character.getAttribute('data-object-id'))!;
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(2);
    await settled(page, id);

    const [, drawn] = await boxesOf(page, id);
    const laidOut = await character.locator('img[data-part="picture"]').evaluate((picture) => {
      const rect = picture.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(drawn[side] - laidOut[side]), `${side}: ${JSON.stringify([drawn, laidOut])}`).toBeLessThan(
        BOX_SLACK_PX
      );
    }
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
    // Beside the top of the picture, clear of it, so a press on the picture takes hold of the piece.
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

    // Turned down on the right, the picture is tipped over to the right: drawn wider than it stood,
    // and further right.
    const [, tipped] = await boxesOf(page, id);
    expect(tipped.width, JSON.stringify([upright, tipped])).toBeGreaterThan(upright.width * 1.3);
    expect(middleOf(tipped).x, JSON.stringify([upright, tipped])).toBeGreaterThan(middleOf(upright).x + 5);
  });

  test('guide a character raised off the floor down to the middle of its pedestal', async ({ page }) => {
    const character = page.locator('game-character', { has: page.getByText('モンスターA', { exact: true }) });
    const id = (await character.getAttribute('data-object-id'))!;
    await idle(page);
    await expect(character.getByTestId('altitude-guide')).toHaveCount(0);

    await character.dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await (await revealMenuEntry(page, menu, '高度設定')).hover();
    const altitude = menu.locator('input[name="altitude-number"]');
    await altitude.click();
    await altitude.press('Control+a');
    await altitude.pressSequentially('2');
    // A press outside the menu closes it; where the menu opens decides where a click would land.
    await page.locator('#app-table-layer').dispatchEvent('mousedown');
    await expect(menu).toHaveCount(0, { timeout: 5000 });
    await idle(page);

    const guide = character.getByTestId('altitude-guide');
    await expect(guide).toBeVisible({ timeout: 5000 });
    const [pedestal] = await boxesOf(page, id);
    const line = (await guide.boundingBox())!;
    const report = JSON.stringify([line, pedestal]);
    // From the height the picture floats at, straight down the screen to the middle of the pedestal.
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
    // The screen over the canvas lays the pole on the frame after it is told how high it is.
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

  test('tumble a die on the canvas, its picture moving and its frame staying, and bring it to rest', async ({
    page,
  }) => {
    const id = await made(page, PIECES[0]);
    await idle(page);
    const [frame, picture] = await boxesOf(page, id);

    await page.locator(`dice-symbol[data-object-id="${id}"]`).dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('ダイスを振る', { exact: true }).click();

    let tumbling: Box[] = [];
    await expect
      .poll(
        async () => {
          tumbling = await boxesOf(page, id);
          return tumbling.length === 2 && JSON.stringify(tumbling[1]) !== JSON.stringify(picture);
        },
        { timeout: 3000, intervals: [50] }
      )
      .toBe(true);
    expect(tumbling[0]).toEqual(frame);
    await expect.poll(() => boxesOf(page, id), { timeout: 5000 }).toEqual([frame, picture]);
  });

  test('turn a die by dragging a knob of the frame that comes out round its foot', async ({ page }) => {
    const id = await made(page, PIECES[0]);
    const [before] = await boxesOf(page, id);

    // The frame comes out with the pointer over the die, a knob at each corner of it.
    const middle = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await page.mouse.move(middle.x, middle.y);
    const knob = page.locator(`dice-symbol[data-object-id="${id}"] [data-testid="turn-frame-knob"]`).nth(2);
    await expect(knob).toBeVisible({ timeout: 5000 });
    const grab = (await knob.boundingBox())!;
    const from = { x: grab.x + grab.width / 2, y: grab.y + grab.height / 2 };
    const reach = Math.hypot(from.x - middle.x, from.y - middle.y);
    const start = Math.atan2(from.y - middle.y, from.x - middle.x);
    await page.mouse.move(from.x, from.y, { steps: 4 });
    await page.mouse.down();
    // An eighth of a turn round the middle, which a square shows by growing its box.
    for (const step of [1, 2, 3]) {
      const turn = start + (step / 3) * (Math.PI / 4);
      await page.mouse.move(middle.x + Math.cos(turn) * reach, middle.y + Math.sin(turn) * reach, { steps: 4 });
    }
    await page.mouse.up();

    await expect.poll(async () => (await boxesOf(page, id))[0].width / before.width).toBeGreaterThan(1.2);
  });

  test('turn a block by a knob of the frame that comes out round its foot', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '地形を作成')).click();
    const block = page.locator('terrain').last();
    const top = block.locator('[data-part="top"]');
    await expect(top).toBeVisible({ timeout: 10000 });
    await idle(page);
    const before = (await top.boundingBox())!;
    const middle = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    // The frame comes out with the pointer over the block, a knob at each corner of it.
    await page.mouse.move(middle.x, middle.y);
    const handle = block.locator('[data-testid="turn-frame-knob"]').nth(2);
    await expect(handle).toBeVisible({ timeout: 5000 });
    const grab = (await handle.boundingBox())!;
    const from = { x: grab.x + grab.width / 2, y: grab.y + grab.height / 2 };
    const reach = Math.hypot(from.x - middle.x, from.y - middle.y);
    const start = Math.atan2(from.y - middle.y, from.x - middle.x);

    await page.mouse.move(from.x, from.y, { steps: 4 });
    await page.mouse.down();
    // An eighth of a turn round the middle, which a square top shows by growing its box.
    for (const step of [1, 2, 3]) {
      const turn = start + (step / 3) * (Math.PI / 4);
      await page.mouse.move(middle.x + Math.cos(turn) * reach, middle.y + Math.sin(turn) * reach, { steps: 4 });
    }
    await page.mouse.up();

    await expect.poll(async () => (await top.boundingBox())!.width / before.width).toBeGreaterThan(1.15);
  });

  for (const piece of PIECES) {
    test(`draw a ${piece.name} where picking finds it, and nothing anywhere else`, async ({ page }) => {
      test.skip(piece.lights === true, 'a light changes the table round it as well');
      await piece.prepare?.(page);
      await idle(page);
      await grabScreen(page);
      const id = await made(page, piece);
      await grabScreen(page);

      const changes = await page.evaluate(
        ({ identifier, slack, step }) => {
          const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
          const [before, after] = (window as unknown as { __shots: ImageData[] }).__shots.slice(-2);
          const boxes = hooks.pieceBoxesOnPage(identifier);
          const left = Math.min(...boxes.map((box) => box.x)) - 40;
          const top = Math.min(...boxes.map((box) => box.y)) - 40;
          const right = Math.max(...boxes.map((box) => box.x + box.width)) + 40;
          const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 40;
          const edges = hooks.edgesOnPage();
          const nearEdge = (x: number, y: number) =>
            edges.some(([x1, y1, x2, y2]) => {
              const dx = x2 - x1;
              const dy = y2 - y1;
              const along = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
              return Math.hypot(x - (x1 + along * dx), y - (y1 + along * dy)) < slack;
            });
          const changed = (x: number, y: number) => {
            const at = (y * before.width + x) * 4;
            return Math.max(...[0, 1, 2].map((c) => Math.abs(before.data[at + c] - after.data[at + c]))) > 6;
          };
          // A point the page draws a part of the piece over, or where another piece lies, says
          // nothing of where the canvas draws this one. The clear boxes of the screen over the
          // canvas draw nothing, and nor does what is laid clear on a part of a piece there.
          const tellsOfPiece = (element: Element | null) => {
            const owner = element?.closest('[data-object-id]');
            if (!owner) return true;
            if (owner.getAttribute('data-object-id') !== identifier) return false;
            if (element!.closest('[data-testid="table-hud"]') && element!.matches('[data-part], [data-hud-box]')) {
              return true;
            }
            for (let at: Element | null = element; at && at !== owner.parentElement; at = at.parentElement) {
              if (getComputedStyle(at).opacity === '0') return true;
            }
            return false;
          };
          const result = { piece: 0, pieceChanged: 0, bare: 0, bareChanged: 0 };
          for (let y = Math.max(0, Math.round(top)); y < Math.min(innerHeight, bottom); y += step) {
            for (let x = Math.max(0, Math.round(left)); x < Math.min(innerWidth, right); x += step) {
              if (nearEdge(x, y) || !tellsOfPiece(document.elementFromPoint(x, y))) continue;
              if (hooks.pickAt(x, y) === identifier) {
                result.piece++;
                if (changed(x, y)) result.pieceChanged++;
              } else {
                result.bare++;
                if (changed(x, y)) result.bareChanged++;
              }
            }
          }
          return result;
        },
        { identifier: id, slack: EDGE_SLACK_PX, step: STEP_PX }
      );

      expect(changes.pieceChanged, JSON.stringify(changes)).toBeGreaterThan(changes.piece * 0.2);
      expect(changes.bareChanged / changes.bare, JSON.stringify(changes)).toBeLessThan(0.01);
    });

    test(`open a ${piece.name}’s menu when it is right-clicked where the canvas draws it`, async ({ page }) => {
      await piece.prepare?.(page);
      const id = await made(page, piece);
      const [shape] = await boxesOf(page, id);

      await page.mouse.click(shape.x + shape.width / 2, shape.y + shape.height / 2, { button: 'right' });

      const menu = page.locator('context-menu');
      await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
      await expect(menu.getByText(piece.menuEntry, { exact: true })).toBeVisible();
    });

    test(`draw a ${piece.name} where it is dragged to while it is dragged`, async ({ page }) => {
      await piece.prepare?.(page);
      const id = await made(page, piece);
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

      // Let go, it is drawn where its object now says: where it was drawn while dragged, give or take
      // a snap to the grid. A piece follows the pointer by the moves it is told of, which a slower
      // page gathers into fewer, so how near the pointer it comes is not asked.
      const [dropped] = await boxesOf(page, id);
      const off = Math.hypot(dropped.x - moved.x, dropped.y - moved.y);
      expect(off, JSON.stringify([shape, moved, dropped])).toBeLessThan(45);
      expect(shape.x - dropped.x, JSON.stringify([shape, dropped])).toBeGreaterThan(60);
    });
  }

  test('put a character dragged about a hex table at the middle of a cell, as the cell it stands on is wide, not as the screen draws it', async ({
    page,
  }) => {
    await openPanel(page, 'テーブル設定');
    await page.locator('select[name="tableGridType"]').selectOption('1');
    await closePanels(page);
    const id = await made(
      page,
      PIECES.find((piece) => piece.name === 'character')!
    );
    const [shape] = await boxesOf(page, id);
    const grabX = shape.x + shape.width / 2;
    const grabY = shape.y + shape.height / 2;
    const placed = page.locator(`[data-object-id="${id}"] [data-location]`).first();
    const before = await placed.getAttribute('data-location');

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX - 60, grabY + 20, { steps: 6 });
    await page.mouse.move(grabX - 130, grabY + 47, { steps: 6 });
    await page.mouse.up();
    await idle(page);
    await expect(placed).not.toHaveAttribute('data-location', before!);

    // The hexes of the grid stand flat at the top, a cell of fifty pixels from one flat side to the
    // other: their columns stand a corner and a half apart, every other one half a cell down.
    const [x, y] = (await placed.getAttribute('data-location'))!.split(',').map(Number);
    const middle = { x: x + 25, y: y + 25 };
    const across = (1.5 * 50) / Math.sqrt(3);
    const column = Math.round(middle.x / across);
    const down = Math.abs(column % 2) === 1 ? 25 : 0;
    const centre = { x: column * across, y: Math.round((middle.y - down) / 50) * 50 + down };
    expect(Math.hypot(middle.x - centre.x, middle.y - centre.y), JSON.stringify({ x, y, centre })).toBeLessThan(1.5);
  });
});
