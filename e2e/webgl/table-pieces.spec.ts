import { expect, Page, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { createDiceSymbol, waitAppReady } from '../helpers';

/**
 * Pieces drawn on the canvas. The page still lays each piece out, clear, to take its presses, so
 * the canvas has to draw a piece exactly where the page lays it out, and picking has to find it
 * there too.
 */

type Box = { x: number; y: number; width: number; height: number };

type Hooks = {
  renderer(): string | null;
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

/** The die made last, and its identifier. */
async function newestDie(page: Page): Promise<string> {
  const die = page.locator('dice-symbol').last();
  await expect(die).toBeAttached();
  return (await die.getAttribute('data-object-id'))!;
}

test.describe('pieces drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('lay a die’s frame and picture where the page lays them out', async ({ page }) => {
    await createDiceSymbol(page);
    const id = await newestDie(page);
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(2);

    await settled(page, id);
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

  test('draw a die where picking finds it, and nothing anywhere else', async ({ page }) => {
    await idle(page);
    await grabScreen(page);
    await createDiceSymbol(page);
    const id = await newestDie(page);
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(2);
    await page.waitForTimeout(800);
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
        const nearEdge = (x: number, y: number) =>
          boxes.some(
            (box) =>
              (Math.abs(x - box.x) < slack || Math.abs(x - box.x - box.width) < slack) &&
              y > box.y - slack &&
              y < box.y + box.height + slack
          ) ||
          boxes.some(
            (box) =>
              (Math.abs(y - box.y) < slack || Math.abs(y - box.y - box.height) < slack) &&
              x > box.x - slack &&
              x < box.x + box.width + slack
          );
        const changed = (x: number, y: number) => {
          const at = (y * before.width + x) * 4;
          return Math.max(...[0, 1, 2].map((c) => Math.abs(before.data[at + c] - after.data[at + c]))) > 6;
        };
        const clearOrOff = (element: Element | null) => {
          const piece = element?.closest('[data-object-id]');
          if (!piece) return true;
          for (let at: Element | null = element; at && at !== piece.parentElement; at = at.parentElement) {
            if (getComputedStyle(at).opacity === '0') return true;
          }
          return false;
        };
        const result = { die: 0, dieChanged: 0, bare: 0, bareChanged: 0 };
        for (let y = Math.max(0, Math.round(top)); y < Math.min(innerHeight, bottom); y += step) {
          for (let x = Math.max(0, Math.round(left)); x < Math.min(innerWidth, right); x += step) {
            if (nearEdge(x, y) || !clearOrOff(document.elementFromPoint(x, y))) continue;
            if (hooks.pickAt(x, y) === identifier) {
              result.die++;
              if (changed(x, y)) result.dieChanged++;
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

    expect(changes.dieChanged, JSON.stringify(changes)).toBeGreaterThan(changes.die * 0.2);
    expect(changes.bareChanged / changes.bare, JSON.stringify(changes)).toBeLessThan(0.01);
  });

  test('open a die’s menu when it is right-clicked where the canvas draws it', async ({ page }) => {
    await createDiceSymbol(page);
    const id = await newestDie(page);
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(2);
    const [frame] = await boxesOf(page, id);

    await page.mouse.click(frame.x + 4, frame.y + frame.height - 4, { button: 'right' });

    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('ダイス目を設定')).toBeVisible();
  });

  test('draw a die where it is dragged to while it is dragged', async ({ page }) => {
    await createDiceSymbol(page);
    const id = await newestDie(page);
    await idle(page);
    await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(2);
    const [frame] = await boxesOf(page, id);
    const grabX = frame.x + 4;
    const grabY = frame.y + frame.height - 4;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 60, grabY + 20, { steps: 6 });
    await page.mouse.move(grabX + 120, grabY + 40, { steps: 6 });
    await expect
      .poll(async () => {
        const [moved] = await boxesOf(page, id);
        return moved.x - frame.x;
      })
      .toBeGreaterThan(60);
    await page.mouse.up();

    await idle(page);
    await expect
      .poll(async () => {
        const [dropped] = await boxesOf(page, id);
        const laidOut = await page.evaluate((identifier) => {
          const die = document.querySelector(`dice-symbol[data-object-id="${identifier}"]`)!;
          const band = [...die.querySelectorAll('div')].find((div) => getComputedStyle(div).borderTopWidth === '6px')!;
          const rect = band.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        }, id);
        return Math.hypot(dropped.x - laidOut.x, dropped.y - laidOut.y);
      })
      .toBeLessThan(BOX_SLACK_PX);
  });
});
