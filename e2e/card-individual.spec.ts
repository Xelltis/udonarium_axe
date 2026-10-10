import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

async function explodeCardStack(page: Page) {
  // 山札を作成し、「山札を崩す」で個別のcard要素を出現させる。
  const tableMenu = await openTableContextMenu(page);
  await tableMenu.getByText('トランプの山札を作成').click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  await page.locator('context-menu').getByText('山札を崩す').click();
  await expect.poll(() => page.locator('card').count(), { timeout: 10000 }).toBeGreaterThan(20);
}

async function openCardMenu(page: Page) {
  await page.locator('card').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('個別カード (card) の操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await explodeCardStack(page);
  });

  test('右クリックメニューにカード固有の項目が出ること', async ({ page }) => {
    const menu = await openCardMenu(page);
    // 表/裏のいずれかは常に出る（現在の面の逆）
    const front = menu.getByText('表にする');
    const back = menu.getByText('裏にする');
    const total = (await front.count()) + (await back.count());
    expect(total).toBeGreaterThanOrEqual(1);
    await expect(menu.getByText('カードを編集')).toBeVisible();
    await expect(menu.getByText('コピーを作る')).toBeVisible();
    await expect(menu.getByText('削除する')).toBeVisible();
  });

  test('「コピーを作る」で card が 1 枚増えること', async ({ page }) => {
    const before = await page.locator('card').count();
    const menu = await openCardMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('card').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('「削除する」で card が 1 枚減ること', async ({ page }) => {
    const before = await page.locator('card').count();
    const menu = await openCardMenu(page);
    await menu.getByText('削除する').click();
    await expect.poll(() => page.locator('card').count(), { timeout: 5000 }).toBeLessThan(before);
  });

  test('「カードを編集」でカードシートが開けること', async ({ page }) => {
    const menu = await openCardMenu(page);
    await menu.getByText('カードを編集').click();
    // カード編集はgame-character-sheetがホストになり（card === trueの経路）、
    // 「表面の画像を変更」「裏面の画像を変更」ボタンが現れる。
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('game-character-sheet').locator('button[title="表面の画像を変更"]')).toBeVisible();
    await expect(page.locator('game-character-sheet').locator('button[title="裏面の画像を変更"]')).toBeVisible();
  });
});
