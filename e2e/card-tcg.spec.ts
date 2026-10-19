import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function createCardStack(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
}

async function drawOne(page: Page) {
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('１枚引く').click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

async function openCardMenu(page: Page) {
  await page.locator('card').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('card handling for trading card games', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui-lang', 'ja'));
    await waitAppReady(page);
  });

  test('opens the dialog that makes a deck from image tags from the table menu', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '画像タグから山札を作成')).click();

    const dialog = page.locator('deck-builder-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText('画像タグ');
    await expect(dialog.getByRole('button', { name: '山札を作る' })).toBeDisabled();
  });

  test('adds an item on the sheet of a card', async ({ page }) => {
    await createCardStack(page);
    await drawOne(page);

    const menu = await openCardMenu(page);
    await menu.getByText('カードを編集').click();

    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.getByRole('button', { name: '編集切り替え', exact: true }).dispatchEvent('click');
    await expect(sheet.getByText('新しい項目を追加').first()).toBeVisible({ timeout: 5000 });
  });

  test('lists the cut-in for when a card is turned over in the card menu', async ({ page }) => {
    await createCardStack(page);
    await drawOne(page);

    const menu = await openCardMenu(page);
    await expect(menu.getByText('めくったときのカットイン')).toBeVisible();
  });

  test('draws an arrow on the table when a target is set, and removes it when the target is cleared', async ({
    page,
  }) => {
    await createCardStack(page);
    await drawOne(page);
    const menu = await openCardMenu(page);
    await menu.getByText('ターゲットを指定').click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText('ターゲットにする対象をクリックしてください')).toBeVisible();

    await page.locator('card-stack').first().dispatchEvent('mousedown');
    await page.locator('card-stack').first().dispatchEvent('mouseup');
    await expect(page.locator('table-target-overlay div')).toHaveCount(2, { timeout: 5000 });

    const cardMenu = await openCardMenu(page);
    await cardMenu.getByText('ターゲットを解除').click();
    await expect(page.locator('table-target-overlay div')).toHaveCount(0, { timeout: 5000 });
  });
});
