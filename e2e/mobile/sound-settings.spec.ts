import { expect, test } from '@playwright/test';

test.describe('sound settings on a phone', () => {
  test('opens the sound settings from the menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
    const closeStartupPanel = page.locator('ui-panel .bg-ui-titlebar button').last();
    if (await closeStartupPanel.count()) await closeStartupPanel.click();

    const menuButton = page.locator('app-mobile-shell nav button').last();
    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await page.locator('app-mobile-shell li button').filter({ hasText: '音の設定' }).first().click();

    const panel = page.locator('app-sound-settings-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    await expect(panel.locator('input[name="handling-volume"]')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });
});
