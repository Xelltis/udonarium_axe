import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function explodeCardStack(page: Page) {
  // Makes a deck and breaks it up from its menu, so that single card elements appear.
  const tableMenu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, tableMenu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  await page.locator('context-menu').getByText('山札を崩す').click();
  await expect.poll(() => page.locator('card').count(), { timeout: 10000 }).toBeGreaterThan(20);
}

async function openCardMenu(page: Page) {
  await page.locator('card').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('handling a single card (card)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await explodeCardStack(page);
  });

  test('shows the entries of a card in its context menu', async ({ page }) => {
    const menu = await openCardMenu(page);
    // One of face up and face down always shows, the opposite of the side it is on.
    const front = menu.getByText('表にする');
    const back = menu.getByText('裏にする');
    const total = (await front.count()) + (await back.count());
    expect(total).toBeGreaterThanOrEqual(1);
    await expect(menu.getByText('カードを編集')).toBeVisible();
    await expect(menu.getByText('コピーを作る')).toBeVisible();
    await expect(menu.getByText('削除する')).toBeVisible();
  });

  test('adds one card with "make a copy"', async ({ page }) => {
    const before = await page.locator('card').count();
    const menu = await openCardMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('card').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });

  test('takes one card away with "delete"', async ({ page }) => {
    const before = await page.locator('card').count();
    const menu = await openCardMenu(page);
    await menu.getByText('削除する').click();
    await expect.poll(() => page.locator('card').count(), { timeout: 5000 }).toBeLessThan(before);
  });

  test('opens the card sheet with "edit card"', async ({ page }) => {
    const menu = await openCardMenu(page);
    await menu.getByText('カードを編集').click();
    // The card editor is hosted by game-character-sheet (the card === true path), and the buttons
    // for changing the front and back images appear.
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('game-character-sheet').locator('button[title="表面の画像を変更"]')).toBeVisible();
    await expect(page.locator('game-character-sheet').locator('button[title="裏面の画像を変更"]')).toBeVisible();
  });
});
