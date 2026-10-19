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

test.describe('more context menu entries of a card stack', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
  });

  test('offers "show the count" in the next menu once "hide the count" is chosen', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('枚数を非表示にする').click();
    const menuAfter = await openCardStackMenu(page);
    await expect(menuAfter.getByText('枚数を表示する')).toBeVisible();
  });

  test('finishes "even out the card size" without an error', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('カードサイズを揃える').click();
    await expect(page.locator('card-stack').first()).toBeAttached();
  });

  test('keeps or adds to the card stacks without crashing on "split the deck among the players"', async ({ page }) => {
    // Alone in the room, Network.peerIds.length === 1 and it does practically nothing. With several
    // people, the deck is split into one pile each. Either way, only that nothing crashes is checked.
    const before = await page.locator('card-stack').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('山札を人数分に分割する').click();
    await expect.poll(() => page.locator('card-stack').count(), { timeout: 5000 }).toBeGreaterThanOrEqual(before);
  });

  test('adds a card stack with "make a copy"', async ({ page }) => {
    const before = await page.locator('card-stack').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('card-stack').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('offers "unlock" in the next menu once "lock" is chosen', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('固定する').click();
    const menuAfter = await openCardStackMenu(page);
    await expect(menuAfter.getByText('固定解除')).toBeVisible();
  });
});
