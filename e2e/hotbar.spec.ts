import { expect, Page, test } from '@playwright/test';

import { chatInput, expectChatText, tableMenuSpot, waitAppReady } from './helpers';

/** Whether a widget shows comes from localStorage, so it is set before the page loads to have the bar out. */
async function showHotbar(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ui-widgets', JSON.stringify({ hotbar: true }));
    localStorage.removeItem('ui-hotbar');
  });
  await waitAppReady(page);
  await expect(page.locator('[data-testid="hotbar"]')).toBeVisible({ timeout: 10000 });
}

function slots(page: Page) {
  return page.locator('[data-testid="hotbar-slot"]');
}

test.describe('the hotbar', () => {
  test.beforeEach(async ({ page }) => {
    await showHotbar(page);
  });

  test('fires a filled slot with its number key, and opens the panel of a menu entry put in a slot when it is pressed', async ({
    page,
  }) => {
    await slots(page).nth(2).click();
    await expect(page.locator('hotbar-slot-editor')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="hotbar-editor-kind"]').selectOption('prefill');
    await page.locator('[data-testid="hotbar-editor-argument"]').fill('走って逃げる');
    await page.locator('[data-testid="hotbar-editor-save"]').click();
    await expect(slots(page).nth(2)).toHaveAttribute('data-filled', 'true');

    await page.locator('#app-table-layer').click({ position: await tableMenuSpot(page) });
    await page.keyboard.press('Digit3');

    await expectChatText(chatInput(page), '走って逃げる');

    await slots(page).nth(3).click();
    await expect(page.locator('hotbar-slot-editor')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="hotbar-editor-kind"]').selectOption('menu');
    await page.locator('[data-testid="hotbar-editor-menu"]').selectOption('jukebox');
    await page.locator('[data-testid="hotbar-editor-save"]').click();
    await expect(slots(page).nth(3)).toHaveAttribute('data-filled', 'true');
    await expect(slots(page).nth(3)).toHaveAttribute('title', 'ジュークボックス');

    await slots(page).nth(3).click();

    await expect(page.locator('app-jukebox')).toBeVisible({ timeout: 10000 });
  });
});
