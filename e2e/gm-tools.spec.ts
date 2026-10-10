import { expect, Page, test } from '@playwright/test';

import { openFabMenu, openPanel, waitAppReady } from './helpers';

/**
 * The GM toolbar is the only way into several panels, and none of them had
 * coverage. These check that each opens, that the toolbar itself is gated on
 * the role, and that the panels a GM leans on during play are populated rather
 * than merely present.
 */
test.describe('GM ツールバー', () => {
  async function becomeGm(page: Page) {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
  }

  const tool = (page: Page, title: string) => page.locator(`app-gm-toolbar [title="${title}"]`);

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('プレイヤーには GM ツールバーが出ず、GM になると現れること', async ({ page }) => {
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toHaveCount(0);

    await becomeGm(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toHaveCount(0);
  });

  test('オブジェクト一覧に卓上のコマが並ぶこと', async ({ page }) => {
    await becomeGm(page);
    await tool(page, 'オブジェクト一覧（GM）').dispatchEvent('click');

    const list = page.locator('game-object-list-panel');
    await expect(list).toBeVisible({ timeout: 10000 });
    // 既定の卓にはキャラクターが置かれている。空の枠だけ出ても通らないようにする。
    const names = await page.locator('game-character [data-testid="piece-name"]').allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    await expect(list).toContainText(names[0].trim());
  });

  test('テーブル関連の小窓のマップエディターとマップ生成は、GM にだけ出ること', async ({ page }) => {
    await openFabMenu(page);
    await page.locator('[data-testid="fab-entry-table"]').click();
    const table = page.locator('[data-testid="fab-submenu-table"]');
    await expect(table.getByTestId('fab-entry-tableSetting')).toBeVisible();
    await expect(table.getByTestId('fab-entry-mapEditor')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await becomeGm(page);
    await page.locator('[data-testid="fab-entry-table"]').click();
    await expect(table.getByTestId('fab-entry-mapEditor')).toBeVisible();
    await expect(table.getByTestId('fab-entry-dungeonGenerator')).toBeVisible();
    await expect(page.locator('app-gm-toolbar [title="マップエディター"]')).toHaveCount(0);
  });

  test('マップエディターがキャンバスごと開くこと', async ({ page }) => {
    await becomeGm(page);
    await openPanel(page, 'マップエディター');

    const editor = page.locator('app-map-editor-panel');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await expect(editor.locator('canvas').first()).toBeVisible();
  });

  test('同行パネルに未所属のキャラクターが並ぶこと', async ({ page }) => {
    await becomeGm(page);
    await tool(page, '同行').dispatchEvent('click');

    const party = page.locator('party-list-panel');
    await expect(party).toBeVisible({ timeout: 10000 });
    const names = await page.locator('game-character [data-testid="piece-name"]').allInnerTexts();
    await expect(party).toContainText(names[0].trim());
  });

  test('バフマネージャーが開くこと', async ({ page }) => {
    await becomeGm(page);
    await openPanel(page, 'バフマネージャー');
    await expect(page.locator('app-buff-manager-panel')).toBeVisible({ timeout: 10000 });
  });

  test('暗闇ボタンは押すたびに表示が入れ替わること', async ({ page }) => {
    await becomeGm(page);
    const darkness = tool(page, '暗闇: オフ（クリックでオン）');
    await expect(darkness).toBeVisible();

    await darkness.click();
    await expect(page.locator('app-gm-toolbar [title="暗闇: オン（クリックでオフ）"]')).toBeVisible({ timeout: 5000 });

    await page.locator('app-gm-toolbar [title="暗闇: オン（クリックでオフ）"]').click();
    await expect(page.locator('app-gm-toolbar [title="暗闇: オフ（クリックでオン）"]')).toBeVisible({ timeout: 5000 });
  });
});
