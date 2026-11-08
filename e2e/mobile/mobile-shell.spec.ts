import { expect, Page, test } from '@playwright/test';

async function waitMobileReady(page: Page) {
  await page.goto('/');
  await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
  const closeStartupPanel = page.locator('ui-panel .bg-ui-titlebar button').last();
  if (await closeStartupPanel.count()) await closeStartupPanel.click();
}

async function openMobileMenu(page: Page) {
  const menuButton = page.locator('app-mobile-shell nav button').last();
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('app-mobile-shell li').first()).toBeVisible();
}

test.describe('the phone shell', () => {
  test.beforeEach(async ({ page }) => {
    await waitMobileReady(page);
  });

  test('turns on the phone layout, with the table and the chat stacked, and keeps it in landscape', async ({
    page,
  }) => {
    await expect(page.locator('body')).toHaveClass(/mobile-layout/);
    await expect(page.locator('[data-testid="fab-menu"]')).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);

    await page.setViewportSize({ width: 840, height: 390 });

    await expect(page.locator('body')).toHaveClass(/mobile-layout/);
    await expect(page.locator('app-mobile-shell nav')).toBeVisible();
  });

  test('opens a panel full screen and closes it, and opens the sound settings from the menu', async ({ page }) => {
    await openMobileMenu(page);
    await page.locator('app-mobile-shell li button').filter({ hasText: '接続' }).first().click();

    const panel = page.locator('ui-panel > div').last();
    const viewport = page.viewportSize();
    await expect
      .poll(async () => (await panel.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);

    await page.locator('ui-panel .bg-ui-titlebar button').last().click();
    await expect(page.locator('ui-panel')).toHaveCount(0);

    await openMobileMenu(page);
    await page.locator('app-mobile-shell li button').filter({ hasText: '音の設定' }).first().click();

    const sound = page.locator('app-sound-settings-panel');
    await expect(sound).toBeVisible({ timeout: 10000 });
    await expect(sound.locator('input[name="handling-volume"]')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBe(0);
  });
});
