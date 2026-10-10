import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

/** A block the master turns into a switch speaks into the chat when a player presses it. */
test.describe('スイッチ', () => {
  async function becomeRole(page: Page, role: 'GM' | 'PL' | '見学') {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) })
      .click();
  }

  async function terrainMenu(page: Page, item: string) {
    await page.locator('terrain').last().locator('.pointer-events-auto').first().dispatchEvent('contextmenu');
    await page.locator('context-menu li').filter({ hasText: item }).first().click();
  }

  /** パネルの閉じるボタンは浮いているツールバーの下に入るので、イベントを直接送る。 */
  async function closePanel(page: Page, title: string) {
    await page
      .locator('ui-panel')
      .filter({ hasText: title })
      .locator('button')
      .filter({ hasText: /^\s*close\s*$/ })
      .first()
      .dispatchEvent('click');
    await expect(page.locator('ui-panel').filter({ hasText: title })).toHaveCount(0, { timeout: 5000 });
  }

  async function setUpChest(page: Page) {
    await waitAppReady(page);
    await becomeRole(page, 'GM');
    await expect(page.locator('app-gm-toolbar [data-testid="gm-toolbar-fold"]')).toBeVisible({ timeout: 10000 });
    const menu = await openTableContextMenu(page, { x: 1000, y: 500 });
    await menu.getByText('地形を作成').click();
    await expect(page.locator('terrain')).toHaveCount(1, { timeout: 10000 });
    await terrainMenu(page, '固定する');
    await terrainMenu(page, 'スイッチを設定');

    const editor = page.getByTestId('board-switch-editor');
    await expect(editor).toBeVisible();
    await editor.getByTestId('board-switch-label').fill('宝箱を開ける');
    await editor.getByTestId('board-switch-speaker').selectOption('host');
    await editor.getByTestId('switch-action-add-say').click();
    await editor.getByTestId('switch-action-text').fill('ギィ…と蓋が開いた');
    await closePanel(page, 'スイッチ - ');
  }

  async function press(page: Page) {
    const block = page.locator('[data-switch-host]');
    await expect(block).toHaveCount(1);
    await block.dispatchEvent('pointerdown', { clientX: 10, clientY: 10 });
    await block.dispatchEvent('click', { clientX: 10, clientY: 10 });
  }

  test('GM が地形をスイッチにし、PL が押すと、その物の名前でチャットに出ること', async ({ page }) => {
    await setUpChest(page);
    await becomeRole(page, 'PL');
    await expect(page.locator('[data-testid="terrain-switch-label"]')).toContainText('宝箱を開ける');

    await press(page);

    await expect(page.locator('chat-window')).toContainText('ギィ…と蓋が開いた', { timeout: 10000 });
  });

  test('見学は押せず、ブロックの上に理由が出ること', async ({ page }) => {
    await setUpChest(page);
    await becomeRole(page, '見学');

    await press(page);

    await expect(page.locator('[data-testid="terrain-switch-label"]')).toContainText('見学中は押せません');
    await expect(page.locator('chat-window')).not.toContainText('ギィ…と蓋が開いた');
  });

  test('PL の右クリックメニューにはスイッチの項目が出ないこと', async ({ page }) => {
    await setUpChest(page);
    await becomeRole(page, 'PL');

    await page.locator('terrain').last().locator('.pointer-events-auto').first().dispatchEvent('contextmenu');

    await expect(page.locator('context-menu li').first()).toBeVisible();
    await expect(page.locator('context-menu')).not.toContainText('スイッチ');
  });
});
