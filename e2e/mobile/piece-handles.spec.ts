import { expect, Locator, test } from '@playwright/test';

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
});
