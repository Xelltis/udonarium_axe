import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

async function createCardStack(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('トランプの山札を作成').click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
}

async function openCardStackMenu(page: Page) {
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('カードスタックの追加コンテキスト操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
  });

  test('「枚数を非表示にする」を選ぶと次回メニューに「枚数を表示する」が出ること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('枚数を非表示にする').click();
    const menuAfter = await openCardStackMenu(page);
    await expect(menuAfter.getByText('枚数を表示する')).toBeVisible();
  });

  test('「カードサイズを揃える」がエラー無く完了すること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('カードサイズを揃える').click();
    await expect(page.locator('card-stack').first()).toBeAttached();
  });

  test('「山札を人数分に分割する」がクラッシュせずに card-stack 数を維持/増加させること', async ({ page }) => {
    // 自分のみの場合はNetwork.peerIds.length === 1で実質ノーオペ。
    // 複数人の場合は人数分の山に分割される。どちらにせよクラッシュしないことだけ確認。
    const before = await page.locator('card-stack').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('山札を人数分に分割する').click();
    await expect.poll(() => page.locator('card-stack').count(), { timeout: 5000 }).toBeGreaterThanOrEqual(before);
  });

  test('「コピーを作る」で card-stack が増えること', async ({ page }) => {
    const before = await page.locator('card-stack').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('card-stack').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('「固定する」を選ぶと次回メニューに「固定解除」が出ること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('固定する').click();
    const menuAfter = await openCardStackMenu(page);
    await expect(menuAfter.getByText('固定解除')).toBeVisible();
  });
});
