import { expect, Page, test } from '@playwright/test';

import { createDiceSymbol, waitAppReady } from './helpers';

async function reopenDiceMenu(page: Page) {
  await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('ダイスシンボルの表示・固定操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createDiceSymbol(page);
  });

  test('既定では「ダイスを公開」または「自分だけ見る」のいずれかが表示されること', async ({ page }) => {
    // isMineの状態に依存して表示項目が分岐する（両方同時には出ない）。
    const menu = await reopenDiceMenu(page);
    const publish = menu.getByText('ダイスを公開');
    const privateOnly = menu.getByText('自分だけ見る');
    const total = (await publish.count()) + (await privateOnly.count());
    expect(total).toBeGreaterThanOrEqual(1);
  });

  test('「ダイス目を設定」サブメニューが存在すること', async ({ page }) => {
    const menu = await reopenDiceMenu(page);
    await expect(menu.getByText('ダイス目を設定')).toBeVisible();
  });

  test('「固定する」を選ぶと次回メニューに「固定解除」が出ること', async ({ page }) => {
    const menu = await reopenDiceMenu(page);
    await menu.getByText('固定する').click();
    const menuAfter = await reopenDiceMenu(page);
    await expect(menuAfter.getByText('固定解除')).toBeVisible();
  });

  test('「削除する」で dice-symbol が DOM から消えること', async ({ page }) => {
    const before = await page.locator('dice-symbol').count();
    const menu = await reopenDiceMenu(page);
    await menu.getByText('削除する').click();
    await expect.poll(() => page.locator('dice-symbol').count(), { timeout: 5000 }).toBeLessThan(before);
  });

  test('「コピーを作る」で dice-symbol が増えること', async ({ page }) => {
    const before = await page.locator('dice-symbol').count();
    const menu = await reopenDiceMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('dice-symbol').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });
});
