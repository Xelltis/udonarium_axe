import { expect, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';
import { centreOf, pedestal, piece, placeOf, Point, pointsOnPicture, settle } from './see-through-helpers';

async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await expect(panels).toHaveCount(0);
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 3, from.y + (to.y - from.y) / 3, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** Comes to a point from below it, the way a hand moves onto a piece, so the pictures it crosses are hovered. */
async function hoverOnto(page: Page, at: Point) {
  await page.mouse.move(at.x - 30, at.y + 120);
  await page.mouse.move(at.x, at.y, { steps: 10 });
}

test.describe('the see-through parts of a piece’s picture', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(piece(page, 'モンスターC').locator('img.image')).toBeVisible({ timeout: 10000 });
    await closePanels(page);
    await settle(piece(page, 'モンスターC'));
  });

  test('grabs and moves the piece behind through a see-through part of the front piece’s picture', async ({ page }) => {
    const front = piece(page, 'モンスターC');
    const back = piece(page, 'モンスターB');
    const behind = await centreOf(pedestal(back));
    // Stood just in front of the other, the great piece's picture rises over it.
    await drag(page, await centreOf(pedestal(front)), { x: behind.x + 30, y: behind.y + 40 });
    await page.mouse.move(5, 5);
    await settle(front);

    const points = await pointsOnPicture(page, 'モンスターC', { frontAlpha: 'clear', beneath: 'モンスターB' });
    expect(points.length).toBeGreaterThan(0);
    const at = points[Math.floor(points.length / 2)];
    const backBefore = await placeOf(back);
    const frontBefore = await placeOf(front);

    await hoverOnto(page, at);
    await expect
      .poll(() =>
        page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('game-character')?.textContent?.includes('モンスターB'),
          [at.x, at.y]
        )
      )
      .toBe(true);
    await drag(page, at, { x: at.x + 100, y: at.y + 20 });

    await expect.poll(() => placeOf(back)).not.toBe(backBefore);
    expect(await placeOf(front)).toBe(frontBefore);
  });

  test('moves the piece whose picture is grabbed where something is drawn', async ({ page }) => {
    const front = piece(page, 'モンスターC');
    const points = await pointsOnPicture(page, 'モンスターC', { frontAlpha: 'solid', beneath: 'table' });
    expect(points.length).toBeGreaterThan(0);
    const at = points[Math.floor(points.length / 2)];
    const before = await placeOf(front);

    await hoverOnto(page, at);
    await drag(page, at, { x: at.x + 100, y: at.y + 20 });

    await expect.poll(() => placeOf(front)).not.toBe(before);
  });

  test('leaves the piece still when only the table is under its see-through part', async ({ page }) => {
    const front = piece(page, 'モンスターC');
    const points = await pointsOnPicture(page, 'モンスターC', { frontAlpha: 'clear', beneath: 'table' });
    expect(points.length).toBeGreaterThan(0);
    const at = points[Math.floor(points.length / 2)];
    const before = await placeOf(front);

    await hoverOnto(page, at);
    await drag(page, at, { x: at.x + 100, y: at.y + 20 });
    await page.waitForTimeout(500);

    expect(await placeOf(front)).toBe(before);
  });
});

test.describe('the see-through parts of a piece’s picture under a finger', () => {
  test.use({ hasTouch: true });

  /** Drags one finger from a point to another, as a touch screen sends it. */
  async function touchDrag(page: Page, from: Point, to: Point) {
    const session = await page.context().newCDPSession(page);
    const at = (point: Point) => [{ x: point.x, y: point.y, id: 1 }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
    for (let step = 1; step <= 10; step++) {
      const point = { x: from.x + ((to.x - from.x) * step) / 10, y: from.y + ((to.y - from.y) * step) / 10 };
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(point) });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }

  test('moves the piece behind when a finger is put on a see-through part of the front piece’s picture', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'The finger is sent through the Chrome DevTools Protocol.');
    await waitAppReady(page);
    const front = piece(page, 'モンスターC');
    const back = piece(page, 'モンスターB');
    await expect(front.locator('img.image')).toBeVisible({ timeout: 10000 });
    await closePanels(page);
    await settle(front);
    const behind = await centreOf(pedestal(back));
    await drag(page, await centreOf(pedestal(front)), { x: behind.x + 30, y: behind.y + 40 });
    await page.mouse.move(5, 5);
    await settle(front);

    const points = await pointsOnPicture(page, 'モンスターC', { frontAlpha: 'clear', beneath: 'モンスターB' });
    expect(points.length).toBeGreaterThan(0);
    const at = points[Math.floor(points.length / 2)];
    const backBefore = await placeOf(back);
    const frontBefore = await placeOf(front);

    await touchDrag(page, at, { x: at.x + 100, y: at.y + 20 });

    await expect.poll(() => placeOf(back)).not.toBe(backBefore);
    expect(await placeOf(front)).toBe(frontBefore);
  });
});
