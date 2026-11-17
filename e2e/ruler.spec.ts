import { expect, Page, test } from '@playwright/test';

import { idle, openGroundAt, putAwayTutorial, waitAppReady } from './helpers';

/** Where a point of the floor, in table pixels, is drawn on the page. */
function onPage(page: Page, x: number, y: number) {
  return page.evaluate(([x, y]) => window.__axeTable.project(x, y, 0)!, [x, y]);
}

test.describe('the ruler', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
  });

  test('measures the table with M, then is left lying on it for everyone and stays once put away', async ({ page }) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('m');
    const band = page.getByTestId('ruler-band');
    await expect(band.getByTestId('ruler-band-hint')).toBeVisible({ timeout: 10000 });

    // Three squares east and four south over open ground, from the middle of one square to another.
    const from = await openGroundAt(page);
    const to = await onPage(page, 25.5 * 50 + 150, 10 * 50 + 200);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();

    const reading = band.getByTestId('ruler-band-reading');
    await expect(reading).toContainText('直線 5.0マス');
    await expect(reading).toContainText('マス数 4');

    await band.getByTestId('ruler-leave').click();
    await expect(page.locator('table-ruler')).toHaveCount(1, { timeout: 10000 });
    await expect(reading).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(band).toHaveCount(0);
    await idle(page);
    await expect(page.locator('table-ruler')).toHaveCount(1);
    await expect(page.getByTestId('ruler-reading').first()).toContainText('直線 5.0マス');
  });
});
