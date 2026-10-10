import { expect, Page, test } from '@playwright/test';

/** ウィジェットの表示状態はlocalStorage由来なので、読み込み前に仕込んでバーを出しておく。 */
async function showHotbar(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ui-widgets', JSON.stringify({ hotbar: true }));
    localStorage.removeItem('ui-hotbar');
  });
  await page.goto('/');
  await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
  const closeStartupPanel = page.locator('ui-panel .bg-ui-titlebar button').last();
  if (await closeStartupPanel.count()) await closeStartupPanel.click();
  await expect(page.locator('[data-testid="hotbar"]')).toBeVisible({ timeout: 10000 });
}

test.describe('スマートフォンのホットバー', () => {
  test.beforeEach(async ({ page }) => {
    await showHotbar(page);
  });

  test('画面幅いっぱいに出て、枠が 10 個並ぶこと', async ({ page }) => {
    await expect(page.locator('[data-testid="hotbar-slot"]')).toHaveCount(10);

    const bar = await page.locator('[data-testid="hotbar"]').boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round(bar!.width)).toBe(viewport!.width);
  });

  test('狭い画面ではショートカットの説明を出さないこと', async ({ page }) => {
    await expect(page.locator('[data-testid="hotbar-hint"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="hotbar-page"]')).toHaveCount(5);
  });

  test('横スクロールを起こさないこと', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });

  test('空き枠をタップすると設定パネルが開くこと', async ({ page }) => {
    await page.locator('[data-testid="hotbar-slot"]').first().tap();

    await expect(page.locator('hotbar-slot-editor')).toBeVisible({ timeout: 10000 });
  });
});
