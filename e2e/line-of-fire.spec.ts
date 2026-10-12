import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';
import { centreOf, pedestal, piece, settle } from './see-through-helpers';

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

test.describe('射線チェック', () => {
  test('ターゲットにした駒までの距離が、交戦エリアのメニューから開くパネルに出ること', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, '部屋設定');
    await page.getByTestId('room-settings-tab-move').click();
    await page.getByTestId('room-settings-zone').getByLabel('交戦エリアを使う').check();
    await closePanels(page);

    const shooter = piece(page, 'キャラクターA');
    const target = piece(page, 'モンスターA');
    await settle(target);
    const aim = await centreOf(pedestal(target));
    await page.keyboard.down('Alt');
    await page.mouse.click(aim.x, aim.y);
    await page.keyboard.up('Alt');

    await shooter.dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('交戦エリア', { exact: true }).hover();
    await menu.getByText('射線チェック', { exact: true }).click();

    const row = page.getByTestId('line-of-fire-row');
    await expect(row).toHaveCount(1, { timeout: 5000 });
    await expect(row.getByTestId('line-of-fire-distance')).toHaveText(/\d+\.\dm/);
  });
});
