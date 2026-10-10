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

test.describe('スマートフォンで見るキャラクターコマ', () => {
  test('傾けるつまみが画像の左右に出て、画像にも名前・HP バー・バフにも重ならないこと', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });

    const piece = page
      .locator('game-character')
      .filter({ has: page.locator('img.image') })
      .filter({ has: page.getByTestId('buff-plate') })
      .first();
    await expect(piece.getByTestId('roll-grab-head')).toBeAttached({ timeout: 10000 });

    // The labels turn to face the viewer a frame after they are drawn, so the check waits for them to settle.
    const clear = async (): Promise<string> => {
      const head = await boxRound(piece.getByTestId('roll-grab-head'));
      const foot = await boxRound(piece.getByTestId('roll-grab-foot'));
      const picture = await boxRound(piece.locator('img.image'));
      const labels = [
        picture,
        await boxRound(piece.getByTestId('piece-name')),
        await boxRound(piece.getByTestId('piece-gauge')),
        await boxRound(piece.getByTestId('buff-plate')),
      ];
      if (!head || !foot || labels.some((label) => label === null)) return 'not drawn yet';
      const drawn = labels as Box[];
      if (drawn.some((label) => overlaps(head, label) || overlaps(foot, label))) {
        return 'a handle lies over the picture or a label';
      }
      if (head.x < picture!.x + picture!.width) return 'the head handle is not right of the picture';
      if (foot.x + foot.width > picture!.x) return 'the foot handle is not left of the picture';
      return 'clear';
    };
    await expect.poll(clear, { timeout: 5000 }).toBe('clear');
  });
});
