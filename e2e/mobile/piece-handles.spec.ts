import { expect, Locator, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The box round everything a locator finds, or null when it finds nothing on screen. */
async function boxRound(locator: Locator): Promise<Box | null> {
  const boxes = (await Promise.all((await locator.all()).map((one) => one.boundingBox()))).filter(
    (box): box is Box => box !== null && box.width > 0
  );
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

test.describe('character pieces seen on a phone', () => {
  test('puts the tilt handle right of the picture, clear of the picture, the name, the HP bar and the buffs', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });

    const piece = page
      .locator('game-character')
      .filter({ has: page.locator('[data-part="picture"]') })
      .filter({ has: page.getByTestId('buff-plate') })
      .first();
    await expect(piece.getByTestId('roll-grab-head')).toBeAttached({ timeout: 10000 });

    // The labels turn to face the viewer a frame after they are drawn, so the check waits for them to settle.
    const clear = async (): Promise<string> => {
      const head = await boxRound(piece.getByTestId('roll-grab-head'));
      const shown = await boxRound(piece.locator('[data-part="picture"]'));
      const labels = [
        shown,
        await boxRound(piece.getByTestId('piece-name')),
        await boxRound(piece.getByTestId('piece-gauge')),
        await boxRound(piece.getByTestId('buff-plate')),
      ];
      if (!head || labels.some((label) => label === null)) return 'not drawn yet';
      const drawn = labels as Box[];
      if (drawn.some((label) => overlaps(head, label))) return 'the handle lies over the picture or a label';
      if (head.x < shown!.x + shown!.width) return 'the handle is not right of the picture';
      return 'clear';
    };
    await expect.poll(clear, { timeout: 5000 }).toBe('clear');
  });

  test('brings out the handles of the piece last touched, and only of that one, and lets no other be pressed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
    await closePanels(page);

    const pieces = page
      .locator('game-character')
      .filter({ has: page.locator('[data-part="picture"]') })
      .filter({ has: page.getByTestId('roll-grab-head') });
    await expect(pieces.nth(1)).toBeAttached({ timeout: 10000 });
    const view = page.viewportSize()!;
    let touched: Locator | null = null;
    let other: Locator | null = null;
    let middle = { x: 0, y: 0 };
    for (const piece of await pieces.all()) {
      const box = await piece.locator('[data-part="picture"]').boundingBox();
      const at = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
      const inView = !!at && at.x > 40 && at.x < view.width - 40 && at.y > 120 && at.y < view.height - 120;
      if (inView && !touched) {
        touched = piece;
        middle = at!;
      } else if (!other) {
        other = piece;
      }
    }
    expect(touched, 'a piece with a picture to tip in view').not.toBeNull();
    const lookOf = (piece: Locator) =>
      piece
        .getByTestId('roll-grab-head')
        .evaluate((handle) => `${getComputedStyle(handle).opacity} ${getComputedStyle(handle).pointerEvents}`)
        .catch(() => 'gone');
    await expect.poll(() => lookOf(touched!), { timeout: 5000 }).toBe('0 none');

    await page.touchscreen.tap(middle.x, middle.y);
    await expect.poll(() => lookOf(touched!), { timeout: 5000 }).toBe('1 auto');
    expect(await lookOf(other!)).toBe('0 none');
  });
});
