import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { createDiceSymbol, openTableContextMenu, revealMenuEntry, waitAppReady } from '../helpers';

/**
 * Pieces drawn on the canvas. The page still lays each piece out, clear, to take its presses, so
 * the canvas has to draw a piece exactly where the page lays it out, and picking has to find it
 * there too.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
  edgesOnPage(): [number, number, number, number][];
  whenIdle(): Promise<void>;
  pickAt(x: number, y: number): string | null;
  aliasOf(identifier: string): string | null;
  pieceBoxesOnPage(identifier: string): Box[];
};

/** How far apart the page's box round a part of a piece and the canvas's may lie, in pixels. */
const BOX_SLACK_PX = 1.5;
/** How far apart the middles of the boxes round a coin's square and round its disc may lie, in pixels. */
const SQUARE_AND_DISC_SLACK_PX = 3;
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

/** Waits for a piece's animations, such as the bounce it comes onto the table with, to finish. */
async function settled(page: Page, identifier: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          document
            .querySelector(`[data-object-id="${id}"]`)!
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length,
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

async function createCoin(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'コインを作成')).click();
  await expect(page.locator('coin').first()).toBeAttached({ timeout: 10000 });
}

async function createDeck(page: Page) {
  const before = await page.locator('card-stack').count();
  const menu = await openTableContextMenu(page);
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
}[] = [
  { name: 'die', tag: 'dice-symbol', create: createDiceSymbol, shapes: 2, menuEntry: 'ダイス目を設定' },
  { name: 'coin', tag: 'coin', create: createCoin, shapes: 1, menuEntry: 'コインを投げる' },
  { name: 'card', tag: 'card', prepare: createDeck, create: drawCard, shapes: 1, menuEntry: '手札に加える' },
  // A deck stands in 30 layers under its plate and its top card.
  { name: 'deck', tag: 'card-stack', create: createDeck, shapes: 32, menuEntry: '１枚引く' },
  { name: 'note', tag: 'text-note', create: createNote, shapes: 1, menuEntry: 'メモを編集' },
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

  test('lay a die’s frame and picture where the page lays them out', async ({ page }) => {
    const id = await made(page, PIECES[0]);

    const [frame, picture] = await boxesOf(page, id);
    const laidOut = await page.evaluate((identifier) => {
      const die = document.querySelector(`dice-symbol[data-object-id="${identifier}"]`)!;
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const band = [...die.querySelectorAll('div')].find((div) => getComputedStyle(div).borderTopWidth === '6px')!;
      return { frame: box(band), picture: box(die.querySelector('img')!) };
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

  test('lay a coin’s side where the page lays it out', async ({ page }) => {
    const id = await made(page, PIECES[1]);

    const [side] = await boxesOf(page, id);
    const laidOut = await page.evaluate((identifier) => {
      const coin = document.querySelector(`coin[data-object-id="${identifier}"]`)!;
      const face = [...coin.querySelectorAll('div')].find((div) => div.style.transform.startsWith('translateZ'))!;
      const rect = face.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, id);

    // The page's box is round the square the side is cut from, the canvas's round the disc itself.
    // The perspective draws the near half of each larger than the far, the square's corners the
    // more, so the middles of the two boxes stand a little apart down the page.
    const middle = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    const off = Math.hypot(middle(side).x - middle(laidOut).x, middle(side).y - middle(laidOut).y);
    expect(off, JSON.stringify([side, laidOut])).toBeLessThan(SQUARE_AND_DISC_SLACK_PX);
    expect(side.width).toBeLessThanOrEqual(laidOut.width + BOX_SLACK_PX);
    expect(side.width).toBeGreaterThan(laidOut.width * 0.7);
  });

  for (const [piece, part] of [
    [PIECES[2], 'img'],
    [PIECES[3], 'img'],
    [PIECES[4], '.rounded-b-ui-sm'],
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

  for (const piece of PIECES) {
    test(`draw a ${piece.name} where picking finds it, and nothing anywhere else`, async ({ page }) => {
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
          // nothing of where the canvas draws this one.
          const tellsOfPiece = (element: Element | null) => {
            const owner = element?.closest('[data-object-id]');
            if (!owner) return true;
            if (owner.getAttribute('data-object-id') !== identifier) return false;
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
      await page.mouse.move(grabX + 60, grabY + 20, { steps: 6 });
      await page.mouse.move(grabX + 120, grabY + 40, { steps: 6 });
      await expect
        .poll(async () => {
          const [moved] = await boxesOf(page, id);
          return moved.x - shape.x;
        })
        .toBeGreaterThan(60);
      await page.mouse.up();
      await idle(page);

      // Let go, it is drawn where its object now says, near the pointer, give or take a snap to the grid.
      const [dropped] = await boxesOf(page, id);
      const off = Math.hypot(dropped.x - shape.x - 120, dropped.y - shape.y - 40);
      expect(off, JSON.stringify([shape, dropped])).toBeLessThan(45);
    });
  }
});
