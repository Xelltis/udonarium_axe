import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

async function createObject(page: Page, menuName: string, selector: string) {
  const menu = await openTableContextMenu(page);
  await menu.getByText(menuName).click();
  await expect(page.locator(selector).first()).toBeAttached({ timeout: 10000 });
}

test.describe('共有メモ (text-note)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createObject(page, '共有メモを作成', 'text-note');
  });

  test('右クリックメニューに「メモを編集」「コピーを作る」が出ること', async ({ page }) => {
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('メモを編集')).toBeVisible();
    await expect(menu.getByText('コピーを作る')).toBeVisible();
  });

  test('コピーで text-note が増えること', async ({ page }) => {
    const before = await page.locator('text-note').count();
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('コピーを作る').click();
    await expect.poll(() => page.locator('text-note').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('「寝かせる」が直後に「直立させる」へ切り替わること', async ({ page }) => {
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('寝かせる').click();
    await page.locator('text-note').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').getByText('直立させる')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('マップマスク (game-table-mask)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createObject(page, 'マップマスクを作成', 'game-table-mask');
  });

  test('右クリックメニューに「スクラッチ開始」が出ること', async ({ page }) => {
    await page.locator('game-table-mask').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('スクラッチ開始')).toBeVisible();
  });

  test('「スクラッチ開始」後はコンテキストメニュー項目が「スクラッチ確定」に切り替わること', async ({ page }) => {
    // onStartScratchはmask.ownerを自分のuserIdにするだけで、scratch-mask要素は
    // 実際にユーザーがドラッグしてから初めて発生する。所有権が自分になったことは、
    // 次回のコンテキストメニューに「スクラッチ確定」が出ることで確認できる。
    await page.locator('game-table-mask').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('スクラッチ開始').click();
    await page.locator('game-table-mask').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').getByText('スクラッチ確定')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('地形 (terrain)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createObject(page, '地形を作成', 'terrain');
  });

  test('右クリックメニューに「傾斜」サブメニューがあること', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('傾斜')).toBeVisible();
  });

  test('透明にした地形を GM が天面から掴んで動かせること', async ({ page }) => {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    const terrain = page.locator('terrain').first();
    await terrain.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('テクスチャを外して透明にする').click();
    const top = terrain.getByTestId('terrain-glass-face').first();
    await expect(top).toBeAttached();
    const box = (await top.boundingBox())!;
    const placed = () => terrain.evaluate((el) => (el.firstElementChild as HTMLElement).style.transform);
    const before = await placed();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    await expect.poll(placed).not.toBe(before);
  });

  test('「傾斜」サブメニューに「壁を非表示」項目が出ること', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('傾斜').hover();
    await expect(page.locator('context-menu').getByText('壁を非表示')).toBeVisible({ timeout: 5000 });
  });
});
