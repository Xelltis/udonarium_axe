import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';
import { centreOf, pedestal, piece } from './see-through-helpers';

/** Where a piece stands on the table, read off the transform its movable element is drawn with. */
async function placeOf(of: Locator): Promise<{ x: number; y: number }> {
  const transform = await of
    .locator('> div')
    .first()
    .evaluate((element) => (element as HTMLElement).style.transform);
  const [, x, y] = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(transform) ?? [];
  return { x: Number(x), y: Number(y) };
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

test.describe('the cells and the music of a table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('keeps a character on its cell when the size of a cell changes', async ({ page }) => {
    const hero = piece(page, 'キャラクターA');
    await expect(hero).toBeAttached({ timeout: 10000 });
    const before = await placeOf(hero);

    const panel = await openTableSettings(page);
    const size = panel.getByTestId('table-cell-size-num');
    await size.fill('100');
    await size.press('Enter');
    await size.blur();

    await expect.poll(() => placeOf(hero), { timeout: 5000 }).toEqual({ x: before.x * 2, y: before.y * 2 });
    await expect(size).toHaveValue('100');
  });

  test('puts a dropped character on the middle of a square of two cells', async ({ page }) => {
    const panel = await openTableSettings(page);
    const squares = panel.getByTestId('table-square-span');
    await squares.selectOption({ label: '2×2マス' });
    await closePanels(page);

    const hero = piece(page, 'キャラクターA');
    const from = await centreOf(pedestal(hero));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 6 });
    await page.mouse.move(from.x + 130, from.y + 70, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const { x, y } = await placeOf(hero);
        return [x % 100, y % 100];
      })
      .toEqual([25, 25]);
  });

  test('offers squares of several cells on a square grid only', async ({ page }) => {
    const panel = await openTableSettings(page);
    await expect(panel.getByTestId('table-square-span')).toBeVisible();

    await panel.locator('select[name="tableGridType"]').selectOption('1');

    await expect(panel.getByTestId('table-square-span')).toHaveCount(0);
  });

  test('offers leaving and stopping the music, and none of the sounds that come with the tool', async ({ page }) => {
    const panel = await openTableSettings(page);
    const music = panel.getByTestId('table-bgm');

    await expect(music.locator('option')).toHaveText(['そのまま', '止める']);
    await music.selectOption({ label: '止める' });
    await expect(music.locator('option:checked')).toHaveText('止める');
  });
});
