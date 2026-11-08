import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, spotOnPiece, waitAppReady } from './helpers';
import { piece } from './see-through-helpers';

/** Where a piece stands on the table, as the table last drew it. */
async function placeOf(of: Locator): Promise<{ x: number; y: number }> {
  const [x, y] = ((await of.locator(':scope > [data-location]').first().getAttribute('data-location')) ?? '')
    .split(',')
    .map(Number);
  return { x, y };
}

async function openTableSettings(page: Page): Promise<Locator> {
  await openPanel(page, 'テーブル設定');
  const panel = page.locator('game-table-setting');
  await expect(panel).toBeVisible({ timeout: 10000 });
  return panel;
}

async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await expect(panels).toHaveCount(0);
}

test.describe('the cells of a table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('puts a dropped character on the middle of a square of two cells', async ({ page }) => {
    const panel = await openTableSettings(page);
    const squares = panel.getByTestId('table-square-span');
    await squares.selectOption({ label: '2×2マス' });
    await closePanels(page);

    const hero = piece(page, 'キャラクターA');
    const from = await spotOnPiece(hero);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y - 40, { steps: 6 });
    await page.mouse.move(from.x + 130, from.y - 70, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const { x, y } = await placeOf(hero);
        return [x % 100, y % 100];
      })
      .toEqual([25, 25]);
  });
});
