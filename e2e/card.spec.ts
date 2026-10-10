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

test.describe('カードスタック (山札)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
  });

  test('右クリックでスタック操作メニューが開けること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await expect(menu.getByText('１枚引く')).toBeVisible();
    await expect(menu.getByText('シャッフル')).toBeVisible();
    await expect(menu.getByText('詳細を表示')).toBeVisible();
  });

  test('シャッフルしてもクラッシュしないこと', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('シャッフル').click();
    // シャッフル後もスタックは存在し続ける。
    await expect(page.locator('card-stack').first()).toBeAttached();
  });

  test('「すべて表にする」が動作すること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('すべて表にする').click();
    await expect(page.locator('card-stack').first()).toBeAttached();
  });

  test('「１枚引く」で card 要素が増えること', async ({ page }) => {
    const initialCardCount = await page.locator('card').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('１枚引く').click();
    // 1枚引くとテーブル上にcardが現れる（stack表示数とは別のDOM）。
    await expect.poll(() => page.locator('card').count(), { timeout: 5000 }).toBeGreaterThan(initialCardCount);
  });

  test('「山札を削除する」で card-stack が DOM から消えること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('山札を削除する').click();
    await expect(page.locator('card-stack')).toHaveCount(0, { timeout: 5000 });
  });

  test('「詳細を表示」で山札シートが開くこと', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('詳細を表示').click();
    // 山札の詳細はgame-character-sheetをホストにして開かれる。
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });
});
