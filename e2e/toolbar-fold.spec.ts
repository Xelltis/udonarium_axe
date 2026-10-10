import { expect, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/** A seat can fold each toolbar down to its title, and finds it folded when it comes back. */
test.describe('ツールバーの折りたたみ', () => {
  async function becomeGm(page: Page) {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await expect(page.locator('app-gm-toolbar [data-testid="gm-toolbar-fold"]')).toBeVisible({ timeout: 10000 });
  }

  test('PL ツールバーを畳むと道具が隠れ、リロードしても畳んだままであること', async ({ page }) => {
    await waitAppReady(page);
    const toolbar = page.locator('app-pl-toolbar');
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });

    await toolbar.getByTestId('pl-toolbar-fold').click();
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toHaveCount(0);
    await expect(toolbar).toContainText('PLツール');

    await page.reload();
    await waitAppReady(page);
    await expect(toolbar.getByTestId('pl-toolbar-fold')).toBeVisible({ timeout: 10000 });
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toHaveCount(0);

    await toolbar.getByTestId('pl-toolbar-fold').click();
    await expect(toolbar.locator('[title="所有キャラクター一覧"]')).toBeVisible();
  });

  test('GM ツールバーを畳んでも PL ツールバーは開いたままであること', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    const gm = page.locator('app-gm-toolbar');
    await expect(gm.locator('[title^="暗闇"]')).toBeVisible();

    await gm.getByTestId('gm-toolbar-fold').click();
    await expect(gm.locator('[title^="暗闇"]')).toHaveCount(0);

    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*PL\s*$/ })
      .click();
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
  });
});
