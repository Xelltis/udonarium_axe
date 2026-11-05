import { expect, test } from '@playwright/test';

import { closePanels } from '../dungeon-helpers';
import { waitAppReady } from '../helpers';

/** How long a press on the bare table is held before it opens a marquee, a little past the table's own wait. */
const LONG_PRESS_MS = 500;

/**
 * The marquee over a table drawn on a canvas, which is laid on the floor where the canvas draws it
 * rather than among the page's own pieces.
 */
test.describe('the marquee over a table drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('lies on the floor from where the press was held to where the pointer has gone, and goes once let go', async ({
    page,
  }) => {
    const from = { x: 1000, y: 540 };
    const to = { x: 1100, y: 600 };
    const marquee = page.getByTestId('table-floor-plane').locator('table-marquee-overlay > div');

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.waitForTimeout(LONG_PRESS_MS);
    await page.mouse.move(to.x, to.y, { steps: 6 });

    await expect(marquee).toBeVisible({ timeout: 5000 });
    await expect
      .poll(async () => {
        const drawn = (await marquee.boundingBox())!;
        return [
          drawn.x < from.x + 4,
          drawn.y < from.y + 4,
          drawn.x + drawn.width > to.x - 4,
          drawn.y + drawn.height > to.y - 4,
        ];
      })
      .toEqual([true, true, true, true]);

    await page.mouse.up();
    await expect(marquee).toHaveCount(0);
  });
});
