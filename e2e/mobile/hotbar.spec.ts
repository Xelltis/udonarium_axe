import { expect, Page, test } from '@playwright/test';

/** Which widgets show comes from localStorage, so it is set before the page loads to have the bar out. */
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

test.describe('the hotbar on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await showHotbar(page);
  });

  test('spans the full width of the screen with ten slots', async ({ page }) => {
    await expect(page.locator('[data-testid="hotbar-slot"]')).toHaveCount(10);

    const bar = await page.locator('[data-testid="hotbar"]').boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round(bar!.width)).toBe(viewport!.width);
  });

  test('shows no shortcut hints on a narrow screen', async ({ page }) => {
    await expect(page.locator('[data-testid="hotbar-hint"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="hotbar-page"]')).toHaveCount(5);
  });

  test('causes no sideways scrolling', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });

  test('opens the settings panel on a tap on an empty slot', async ({ page }) => {
    await page.locator('[data-testid="hotbar-slot"]').first().tap();

    await expect(page.locator('hotbar-slot-editor')).toBeVisible({ timeout: 10000 });
  });
});
