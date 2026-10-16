import { expect, Page, test } from '@playwright/test';

import { openFabMenu, openPanel, waitAppReady } from './helpers';

/**
 * The GM toolbar is the only way into several panels, and none of them had
 * coverage. These check that each opens, that the toolbar itself is gated on
 * the role, and that the panels a GM leans on during play are populated rather
 * than merely present.
 */
test.describe('the GM toolbar', () => {
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

  test('shows no GM toolbar to a player, and brings it up on becoming the GM', async ({ page }) => {
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toHaveCount(0);

    await becomeGm(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toHaveCount(0);
  });

  test('lists the pieces on the table in the object list', async ({ page }) => {
    await becomeGm(page);
    await tool(page, 'オブジェクト一覧（GM）').dispatchEvent('click');

    const list = page.locator('game-object-list-panel');
    await expect(list).toBeVisible({ timeout: 10000 });
    // The default table has characters on it, so that an empty frame alone does not pass.
    const names = await page.locator('game-character [data-testid="piece-name"]').allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    await expect(list).toContainText(names[0].trim());
  });

  test("shows the map editor and the map generator in the Table group's small window to the GM alone", async ({
    page,
  }) => {
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

  test('opens the map editor along with its canvas', async ({ page }) => {
    await becomeGm(page);
    await openPanel(page, 'マップエディター');

    const editor = page.locator('app-map-editor-panel');
    await expect(editor).toBeVisible({ timeout: 15000 });
    await expect(editor.locator('canvas').first()).toBeVisible();
  });

  test('lists the characters that belong to no party in the party panel', async ({ page }) => {
    await becomeGm(page);
    await tool(page, '同行').dispatchEvent('click');

    const party = page.locator('party-list-panel');
    await expect(party).toBeVisible({ timeout: 10000 });
    const names = await page.locator('game-character [data-testid="piece-name"]').allInnerTexts();
    await expect(party).toContainText(names[0].trim());
  });

  test('opens the buff manager', async ({ page }) => {
    await becomeGm(page);
    await openPanel(page, 'バフマネージャー');
    await expect(page.locator('app-buff-manager-panel')).toBeVisible({ timeout: 10000 });
  });

  test('swaps what the darkness button shows each time it is pressed', async ({ page }) => {
    await becomeGm(page);
    const darkness = tool(page, '暗闇: オフ（クリックでオン）');
    await expect(darkness).toBeVisible();

    await darkness.click();
    await expect(page.locator('app-gm-toolbar [title="暗闇: オン（クリックでオフ）"]')).toBeVisible({ timeout: 5000 });

    await page.locator('app-gm-toolbar [title="暗闇: オン（クリックでオフ）"]').click();
    await expect(page.locator('app-gm-toolbar [title="暗闇: オフ（クリックでオン）"]')).toBeVisible({ timeout: 5000 });
  });
});
