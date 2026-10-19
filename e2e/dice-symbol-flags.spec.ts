import { expect, Page, test } from '@playwright/test';

import { createDiceSymbol, waitAppReady } from './helpers';

async function reopenDiceMenu(page: Page) {
  await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('showing and locking a dice symbol', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createDiceSymbol(page);
  });

  test('shows either "reveal the dice" or "see it alone" by default', async ({ page }) => {
    // Which entry shows depends on isMine; the two never show together.
    const menu = await reopenDiceMenu(page);
    const publish = menu.getByText('ダイスを公開');
    const privateOnly = menu.getByText('自分だけ見る');
    const total = (await publish.count()) + (await privateOnly.count());
    expect(total).toBeGreaterThanOrEqual(1);
  });

  test('has the "set the face" submenu', async ({ page }) => {
    const menu = await reopenDiceMenu(page);
    await expect(menu.getByText('ダイス目を設定')).toBeVisible();
  });

  test('offers "unlock" in the next menu once "lock" is chosen', async ({ page }) => {
    const menu = await reopenDiceMenu(page);
    await menu.getByText('固定する').click();
    const menuAfter = await reopenDiceMenu(page);
    await expect(menuAfter.getByText('固定解除')).toBeVisible();
  });

  test('removes the dice-symbol from the DOM with "delete"', async ({ page }) => {
    const before = await page.locator('dice-symbol').count();
    const menu = await reopenDiceMenu(page);
    await menu.getByText('削除する').click();
    await expect.poll(() => page.locator('dice-symbol').count(), { timeout: 5000 }).toBeLessThan(before);
  });

  test('adds a dice-symbol with "make a copy"', async ({ page }) => {
    const before = await page.locator('dice-symbol').count();
    const menu = await reopenDiceMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('dice-symbol').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });
});
