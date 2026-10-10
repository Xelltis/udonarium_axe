import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

async function openInventoryWithCharacter(page: Page) {
  await waitAppReady(page);
  await createCharacter(page);
  await openPanel(page, 'インベントリ');
  await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
}

test.describe('インベントリの一括移動 (multi-move)', () => {
  test.beforeEach(async ({ page }) => {
    await openInventoryWithCharacter(page);
  });

  test('一括移動ボタンを押すと multi-move バーが現れること', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    // multi-moveバー左端の見出しspan。material-iconsのligature "open_with"が
    // 同じノードのテキストに含まれるので、anchorは使わずsubstring matchにする。
    await expect(
      page
        .locator('game-object-inventory')
        .getByText(/一括移動/)
        .first()
    ).toBeVisible({
      timeout: 5000,
    });
    // 移動先ボタン（3件: 共有/個人/墓場）
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /共有/ })).toBeVisible();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /個人/ })).toBeVisible();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /墓場/ })).toBeVisible();
  });

  test('「全選択」「全解除」トグルが動作すること', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    const allSelect = page.locator('game-object-inventory').getByRole('button', { name: /全選択/ });
    await expect(allSelect).toBeVisible({ timeout: 5000 });
    await allSelect.click();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /全解除/ })).toBeVisible();
    await page
      .locator('game-object-inventory')
      .getByRole('button', { name: /全解除/ })
      .click();
    await expect(page.locator('game-object-inventory').getByRole('button', { name: /全選択/ })).toBeVisible();
  });

  test('「キャンセル」で multi-move を抜けると一括移動バーが消えること', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    const heading = page
      .locator('game-object-inventory')
      .getByText(/一括移動/)
      .first();
    await expect(heading).toBeVisible();
    await page
      .locator('game-object-inventory')
      .getByRole('button', { name: /キャンセル/ })
      .click();
    await expect(heading).toBeHidden();
  });

  test('全選択 → 「共有」で対象アイテムが共有タブに移動し、テーブルタブから減ること', async ({ page }) => {
    const items = page.locator('game-object-inventory [data-testid="inventory-item"]');
    const initialCount = await items.count();
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    await page
      .locator('game-object-inventory')
      .getByRole('button', { name: /全選択/ })
      .click();
    await page.locator('game-object-inventory').getByRole('button', { name: /共有/ }).click();
    await expect.poll(() => items.count(), { timeout: 5000 }).toBeLessThan(initialCount);
    // 共有タブに切替
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(1).click();
    await expect(items.first()).toBeVisible({ timeout: 5000 });
  });

  test('テーブルタブでは「インベントリで非表示」「表示」ボタンが現れること', async ({ page }) => {
    await page.locator('game-object-inventory button[title="一括移動"]').click();
    await expect(
      page.locator('game-object-inventory').getByRole('button', { name: /インベントリで非表示/ })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('game-object-inventory').getByRole('button', { name: /インベントリで表示/ })
    ).toBeVisible();
  });
});
