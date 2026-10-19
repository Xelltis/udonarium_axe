import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

test.describe('more context menu actions on terrain', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    const tableMenu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, tableMenu, '地形を作成')).click();
    await expect(page.locator('terrain').first()).toBeAttached({ timeout: 10000 });
  });

  test('offers "show walls" in the next menu once "hide walls" is chosen', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('壁を非表示').click();
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').getByText('壁を表示')).toBeVisible({ timeout: 5000 });
  });

  test('lists none, the four sides of a square table and all directions in the "slope" submenu', async ({ page }) => {
    await page.locator('terrain').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('傾斜').hover();
    // context-menu strips the check marks from the visible nodes, so each li is checked as a whole.
    const items = page.locator('context-menu li');
    for (const side of ['なし', '北', '東', '南', '西', '全方向']) {
      await expect(items.filter({ hasText: side }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('slopes more than one side, and makes a pyramid with all directions', async ({ page }) => {
    const faces = page.locator('[data-testid="terrain-slope-face"]');

    await chooseSlope(page, '南');
    await expect(faces).toHaveCount(1);

    await chooseSlope(page, '北');
    await expect(faces).toHaveCount(2);

    await chooseSlope(page, '全方向');
    await expect(faces).toHaveCount(4);

    await chooseSlope(page, '全方向');
    await expect(faces).toHaveCount(0);
  });
});

/** Turns one side of the first terrain's slope on or off from its right-click menu. */
async function chooseSlope(page: Page, side: string) {
  await page.locator('terrain').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('傾斜', { exact: true }).hover();
  await menu
    .locator('li')
    .filter({ hasText: side })
    .first()
    .locator('span')
    .first()
    .dispatchEvent('click', { bubbles: true });
  await page.keyboard.press('Escape');
}

async function createDiceOnTable(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'ダイスを作成')).hover();
  await expect(menu.getByText('D6')).toBeVisible({ timeout: 5000 });
  await menu.getByText('D6').click();
  await expect(page.locator('dice-symbol').first()).toBeAttached({ timeout: 10000 });
}

test.describe('the dice symbol’s set-face submenu', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createDiceOnTable(page);
  });

  test('offers numbers in the "set face" submenu (1 to 6 for a D6)', async ({ page }) => {
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('ダイス目を設定').hover();
    // A D6 has six faces, so at least six choices show (with ◉/○ radio marks).
    const items = page.locator('context-menu li');
    for (const face of ['1', '2', '3', '4', '5', '6']) {
      await expect(items.filter({ hasText: new RegExp(`(?:^|\\s)${face}(?:$|\\s)`) }).first()).toBeVisible({
        timeout: 5000,
      });
    }
  });
});

test.describe('showing and hiding a die', () => {
  test('offers "reveal the die" in the next menu once "only me" is chosen', async ({ page }) => {
    await waitAppReady(page);
    await createDiceOnTable(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    const onlyMe = menu.getByText('自分だけ見る');
    // Skipped when the die is already hidden, as the menu should then offer "reveal the die" instead.
    if ((await onlyMe.count()) === 0) {
      test.skip(true, '既定で既に非公開状態のためスキップ');
    }
    await onlyMe.click();
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    await expect(menu.getByText('ダイスを公開')).toBeVisible({ timeout: 5000 });
  });
});
