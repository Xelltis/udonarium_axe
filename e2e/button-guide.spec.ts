import { expect, Page, test } from '@playwright/test';

import { openFabMenu, openSeatDisplay, waitAppReady } from './helpers';

/** Every button in the drawer and on the toolbar says what it is at once, and goes quiet again. */
test.describe('ボタンの名前をまとめて見る', () => {
  async function ready(page: Page) {
    await waitAppReady(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
    // The chat box can hold the focus after start-up, and a key typed there is text, not a shortcut.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  test('? キーで FAB とツールバーのボタンの名前が出て、Esc で消えること', async ({ page }) => {
    await ready(page);

    await page.keyboard.press('?');

    const toolbarNames = page.locator('app-pl-toolbar [data-testid="button-guide-label"]');
    await expect(toolbarNames.filter({ hasText: /^インベントリ$/ })).toBeVisible();
    await expect(toolbarNames.filter({ hasText: /^所有キャラクター一覧$/ })).toBeVisible();
    const fab = page.getByTestId('fab-menu');
    await expect(fab.getByTestId('button-guide-label').filter({ hasText: /^チャット$/ })).toBeVisible();
    await expect(fab.getByTestId('button-guide-entry').filter({ hasText: 'ジュークボックス' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('button-guide-label')).toHaveCount(0);
  });

  test('小窓の中身を名前の横から直接開けて、開くと名前が消えること', async ({ page }) => {
    await ready(page);
    await page.keyboard.press('?');

    await page.getByTestId('fab-menu').getByTestId('button-guide-entry').filter({ hasText: 'インベントリ' }).click();

    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    await expect(page.getByTestId('button-guide-label')).toHaveCount(0);
  });

  test('FAB の ? ボタンで名前が出て、卓をクリックすると消えること', async ({ page }) => {
    await ready(page);
    await openFabMenu(page);

    await page.getByTestId('fab-entry-buttonGuide').click();
    await expect(page.locator('app-pl-toolbar [data-testid="button-guide-label"]').first()).toBeVisible();

    await page.locator('#app-table-layer').click({ position: { x: 900, y: 500 } });
    await expect(page.getByTestId('button-guide-label')).toHaveCount(0);
  });

  test('メニューの編集でツールバーに足した ? からも出せて、FAB から外しても ? キーで出せること', async ({ page }) => {
    await ready(page);
    const display = await openSeatDisplay(page);
    await display.getByTestId('fab-entry-menuEditor').click();
    const editor = page.locator('ui-panel').filter({ has: page.getByTestId('menu-editor-rows') });

    await editor.getByTestId('menu-editor-surface-plToolbar').click();
    await editor.getByTestId('menu-editor-add').click();
    await editor.getByTestId('menu-command-choice-buttonGuide').click();
    const onBar = page.locator('app-pl-toolbar [data-testid="fab-entry-buttonGuide"]');
    await onBar.click();
    await expect(page.locator('app-pl-toolbar [data-testid="button-guide-label"]').first()).toBeVisible();
    await onBar.click();
    await expect(page.locator('app-pl-toolbar [data-testid="button-guide-label"]').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await editor.getByTestId('menu-editor-surface-fab').click();
    await editor.getByTestId('menu-editor-remove-buttonGuide').click();
    await expect(page.getByTestId('fab-menu').getByTestId('fab-entry-buttonGuide')).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('?');
    await expect(page.getByTestId('fab-menu').getByTestId('button-guide-label').first()).toBeVisible();
  });
});
