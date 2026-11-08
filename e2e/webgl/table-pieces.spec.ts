import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import {
  cellSpot,
  createCharacter,
  createDiceSymbol,
  openTableContextMenu,
  revealMenuEntry,
  waitAppReady,
} from '../helpers';

/**
 * Pieces drawn on the canvas. The page still lays each piece out, clear, to take its presses, and
 * picking finds it by the shapes the scene is built from, so the canvas has to draw a piece exactly
 * where picking finds it: what making a piece changes on the screen is held against where picking
 * says the piece is. Where the page lays a piece out, its menu and its drags are held in
 * e2e/canvas-picking.spec.ts, with nothing drawn.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
  moving(identifier: string): boolean;
  edgesOnPage(): [number, number, number, number][];
  whenIdle(): Promise<void>;
  pickAt(x: number, y: number): string | null;
  pieceBoxesOnPage(identifier: string): Box[];
};

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

/** A picture of the screen, read into the page so its colours can be looked up there, beside the one taken before it. */
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
    (window as unknown as { __shots: ImageData[] }).__shots = [
      ...kept.slice(-1),
      canvas.getContext('2d')!.getImageData(0, 0, image.width, image.height),
    ];
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

/** The identifiers of the pieces with a tag on the table now. */
function idsOf(page: Page, tag: string): Promise<string[]> {
  return page.locator(tag).evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('data-object-id')!));
}

/**
 * The identifier of the piece with a tag that has come onto the table since the identifiers given
 * were read: the first table's tutorial lays out pieces of its own, which may come after it.
 */
async function madeSince(page: Page, tag: string, before: readonly string[]): Promise<string> {
  let made: string | undefined;
  await expect
    .poll(async () => {
      made = (await idsOf(page, tag)).find((id) => !before.includes(id));
      return made;
    })
    .toBeTruthy();
  return made!;
}

/**
 * A point of the bare board south of the sample pieces, as an offset into the table's layer, with
 * room to its right for a card drawn off a deck.
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

/**
 * The kinds of piece drawn on the canvas: what is set out before one is made, how it is made, how
 * many shapes it is drawn with, and how it is taken off the table again, with what was set out for it.
 * A light is left out, as it changes the table round it as well as where it is drawn.
 */
const PIECES: readonly {
  name: string;
  tag: string;
  prepare?: (page: Page) => Promise<void>;
  create: (page: Page) => Promise<void>;
  shapes: number;
  takenAwayBy: string;
  leavesBehind?: { tag: string; takenAwayBy: string };
}[] = [
  { name: 'die', tag: 'dice-symbol', create: createDiceSymbol, shapes: 2, takenAwayBy: '削除する' },
  { name: 'coin', tag: 'coin', create: createCoin, shapes: 1, takenAwayBy: '削除する' },
  {
    name: 'card',
    tag: 'card',
    prepare: createDeck,
    create: drawCard,
    shapes: 1,
    takenAwayBy: '削除する',
    leavesBehind: { tag: 'card-stack', takenAwayBy: '山札を削除する' },
  },
  // A deck stands in 30 layers under its plate and its top card.
  { name: 'deck', tag: 'card-stack', create: createDeck, shapes: 32, takenAwayBy: '山札を削除する' },
  { name: 'note', tag: 'text-note', create: createNote, shapes: 1, takenAwayBy: '削除する' },
  { name: 'mask', tag: 'game-table-mask', create: createMask, shapes: 1, takenAwayBy: '削除する' },
  { name: 'range', tag: 'range', create: createRange, shapes: 1, takenAwayBy: '削除する' },
  { name: 'character', tag: 'game-character', create: createCharacter, shapes: 1, takenAwayBy: '墓場に移動' },
];

/** Makes a piece and waits until the canvas draws it and its animations are over, and answers its identifier. */
async function made(page: Page, piece: (typeof PIECES)[number]): Promise<string> {
  const before = await idsOf(page, piece.tag);
  await piece.create(page);
  const id = await madeSince(page, piece.tag, before);
  await idle(page);
  await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(piece.shapes);
  await settled(page, id);
  await idle(page);
  return id;
}

/** Takes a piece off the table by the entry of its own menu given. */
async function takeAway(page: Page, tag: string, identifier: string, entry: string) {
  const piece = page.locator(`${tag}[data-object-id="${identifier}"]`);
  await piece.dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await (await revealMenuEntry(page, menu, entry, true)).click();
  await expect(piece).toHaveCount(0, { timeout: 5000 });
}

/**
 * What changed between the last two pictures of the screen round a piece, at points where picking
 * finds the piece and at points where it finds something else or nothing, leaving out points on the
 * very edge of a shape and points the page draws a part of a piece over.
 */
function changesRound(page: Page, identifier: string) {
  return page.evaluate(
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
    { identifier, slack: EDGE_SLACK_PX, step: STEP_PX }
  );
}

test.describe('pieces drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('draw each kind of piece where picking finds it, and nothing anywhere else', async ({ page }) => {
    test.setTimeout(240_000);
    for (const piece of PIECES) {
      const setOut = piece.leavesBehind ? await idsOf(page, piece.leavesBehind.tag) : [];
      await piece.prepare?.(page);
      const left = piece.leavesBehind ? await madeSince(page, piece.leavesBehind.tag, setOut) : null;
      await idle(page);
      await grabScreen(page);
      const id = await made(page, piece);
      await grabScreen(page);

      const changes = await changesRound(page, id);

      expect(changes.pieceChanged, `${piece.name}: ${JSON.stringify(changes)}`).toBeGreaterThan(changes.piece * 0.2);
      expect(changes.bareChanged / changes.bare, `${piece.name}: ${JSON.stringify(changes)}`).toBeLessThan(0.01);
      await takeAway(page, piece.tag, id, piece.takenAwayBy);
      if (left) await takeAway(page, piece.leavesBehind!.tag, left, piece.leavesBehind!.takenAwayBy);
    }
  });
});
