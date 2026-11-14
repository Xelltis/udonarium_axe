import { expect, test } from '@playwright/test';

import { becomeGm, closePanels, openPanel, rightClickPiece, waitAppReady } from './helpers';
import { centreOf, pedestal, piece, settle } from './see-through-helpers';

test.describe('line-of-fire check', () => {
  test('shows the distance to the targeted piece in the panel opened from the engagement zone menu', async ({
    page,
  }) => {
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

    await rightClickPiece(shooter);
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('交戦エリア', { exact: true }).hover();
    await menu.getByText('射線チェック', { exact: true }).click();

    const row = page.getByTestId('line-of-fire-row');
    await expect(row).toHaveCount(1, { timeout: 5000 });
    await expect(row.getByTestId('line-of-fire-distance')).toHaveText(/\d+\.\dm/);
  });
});
