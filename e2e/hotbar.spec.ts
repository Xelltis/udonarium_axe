import { expect, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';

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

  test('lines up a slot for each number key, with hints for the pages and shortcuts above', async ({ page }) => {
    await expect(slots(page)).toHaveCount(10);
    await expect(page.locator('[data-testid="hotbar-page"]')).toHaveCount(5);
    await expect(page.locator('[data-testid="hotbar-hint"]')).toBeVisible();
  });

  test('opens the settings panel on an empty slot, and fills the slot on save', async ({ page }) => {
    await slots(page).nth(1).click();
    await expect(page.locator('hotbar-slot-editor')).toBeVisible({ timeout: 10000 });

    await page.locator('[data-testid="hotbar-editor-kind"]').selectOption('prefill');
    await page.locator('[data-testid="hotbar-editor-argument"]').fill('/w gm 準備できました');
    await page.locator('[data-testid="hotbar-editor-label"]').fill('耳打ち');
    await page.locator('[data-testid="hotbar-editor-save"]').click();

    await expect(slots(page).nth(1)).toHaveAttribute('data-filled', 'true');
    await expect(slots(page).nth(1)).toHaveAttribute('title', '耳打ち');
  });

  test('fires a filled slot with its number key', async ({ page }) => {
    await slots(page).nth(2).click();
    await expect(page.locator('hotbar-slot-editor')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="hotbar-editor-kind"]').selectOption('prefill');
    await page.locator('[data-testid="hotbar-editor-argument"]').fill('走って逃げる');
    await page.locator('[data-testid="hotbar-editor-save"]').click();
    await expect(slots(page).nth(2)).toHaveAttribute('data-filled', 'true');

    await page.locator('body').click({ position: { x: 900, y: 250 } });
    await page.keyboard.press('Digit3');

    await expect(page.locator('textarea.chat-input')).toHaveValue('走って逃げる');
  });

  test('opens the panel of the menu entry put in a slot when the slot is pressed', async ({ page }) => {
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

  test('shows other slots on another page, and the first ones again on going back', async ({ page }) => {
    await slots(page).nth(0).click();
    await expect(page.locator('hotbar-slot-editor')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="hotbar-editor-kind"]').selectOption('prefill');
    await page.locator('[data-testid="hotbar-editor-argument"]').fill('1ページ目');
    await page.locator('[data-testid="hotbar-editor-save"]').click();
    await expect(slots(page).nth(0)).toHaveAttribute('data-filled', 'true');

    await page.locator('[data-testid="hotbar-page"][data-page="1"]').click();
    await expect(slots(page).nth(0)).toHaveAttribute('data-filled', 'false');

    await page.locator('[data-testid="hotbar-page"][data-page="0"]').click();
    await expect(slots(page).nth(0)).toHaveAttribute('data-filled', 'true');
  });

  test('stays put once locked', async ({ page }) => {
    const bar = page.locator('[data-testid="hotbar"]');
    const before = await bar.boundingBox();

    await page.locator('[data-testid="hotbar-lock"]').click();
    await page.mouse.move(before!.x + 5, before!.y + 5);
    await page.mouse.down();
    await page.mouse.move(before!.x + 205, before!.y - 95, { steps: 10 });
    await page.mouse.up();

    const after = await bar.boundingBox();
    expect(Math.round(after!.x)).toBe(Math.round(before!.x));
    expect(Math.round(after!.y)).toBe(Math.round(before!.y));
  });
});
