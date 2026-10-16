import { expect, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';
import { centreOf, pedestal, piece, placeOf, settle } from './see-through-helpers';

async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await expect(panels).toHaveCount(0);
}

async function useHexGrid(page: Page) {
  await page.locator('#app-table-layer').click({ button: 'right', position: { x: 900, y: 250 } });
  const entry = page.locator('context-menu').getByText('テーブル設定', { exact: true });
  await expect(entry).toBeVisible({ timeout: 15000 });
  await entry.click();
  const gridType = page.locator('modal select[name="tableGridType"]');
  await expect(gridType).toBeVisible({ timeout: 20000 });
  await gridType.selectOption('1');
  await page.locator('modal button', { hasText: 'close' }).first().dispatchEvent('click');
  await expect(page.locator('modal')).toHaveCount(0);
}

test.describe('hex pedestals', () => {
  test('moves a piece without turning it when the inside of its pedestal is pressed and dragged', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await useHexGrid(page);
    const character = piece(page, 'キャラクターC');
    await settle(character);
    const before = await placeOf(character);
    const from = await centreOf(pedestal(character));

    const hit = await page.evaluate(
      ({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.classList.contains('rotate-grab') ?? false,
      from
    );
    expect(hit).toBe(false);

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y, { steps: 6 });
    await page.mouse.move(from.x + 120, from.y, { steps: 8 });
    await page.mouse.up();
    await settle(character);

    await expect.poll(() => placeOf(character), { timeout: 5000 }).not.toBe(before);
  });
});
