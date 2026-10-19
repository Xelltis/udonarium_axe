import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function createCardStack(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
}

async function openCardStackMenu(page: Page) {
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('card stacks (decks)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
  });

  test('opens the stack menu on a right click', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await expect(menu.getByText('１枚引く')).toBeVisible();
    await expect(menu.getByText('シャッフル')).toBeVisible();
    await expect(menu.getByText('詳細を表示')).toBeVisible();
  });

  test('does not crash on a shuffle', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('シャッフル').click();
    // The stack is still there after the shuffle.
    await expect(page.locator('card-stack').first()).toBeAttached();
  });

  test('runs "turn all face up"', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('すべて表にする').click();
    await expect(page.locator('card-stack').first()).toBeAttached();
  });

  test('adds a card element with "draw one"', async ({ page }) => {
    const initialCardCount = await page.locator('card').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('１枚引く').click();
    // Drawing one puts a card on the table, a DOM element apart from the count shown on the stack.
    await expect.poll(() => page.locator('card').count(), { timeout: 5000 }).toBeGreaterThan(initialCardCount);
  });

  test('removes the card-stack from the DOM with "delete the deck"', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('山札を削除する').click();
    await expect(page.locator('card-stack')).toHaveCount(0, { timeout: 5000 });
  });

  test('opens the deck sheet with "show details"', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('詳細を表示').click();
    // The deck's details open hosted by game-character-sheet.
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });
});
