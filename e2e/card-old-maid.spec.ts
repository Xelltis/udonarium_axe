import { expect, Page, test } from '@playwright/test';

import { openPanel, openTableContextMenu, waitAppReady } from './helpers';

async function createCardStack(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('トランプの山札を作成').click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
}

async function openHandRail(page: Page) {
  await openPanel(page, '手札');
  await expect(page.locator('app-hand-rail .hand-rail')).toBeVisible({ timeout: 5000 });
}

async function dealAll(page: Page) {
  const menu = await openCardStackMenu(page);
  const item = menu.getByText('全員に配り切る');
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

async function openCardStackMenu(page: Page) {
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('ババ抜き向けのカード操作', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui-lang', 'ja'));
    await waitAppReady(page);
    await createCardStack(page);
    await openHandRail(page);
  });

  test('「全員に配り切る」で山札が手札へ入り、ジョーカーが 1 枚残ること', async ({ page }) => {
    await dealAll(page);

    const hand = page.locator('app-hand-rail');
    await expect(hand).toContainText('手札 53枚', { timeout: 15000 });
    await expect(page.locator('card-stack').first()).toContainText('1', { timeout: 5000 });
  });

  test('ペアを捨てると捨て札の山ができること', async ({ page }) => {
    await dealAll(page);
    const hand = page.locator('app-hand-rail');
    await expect(hand).toContainText('手札 53枚', { timeout: 15000 });

    await hand.locator('button[title="ペアを捨てる"]').click();

    await expect(hand).toContainText('手札 1枚', { timeout: 15000 });
    await expect(page.locator('card-stack')).toHaveCount(2, { timeout: 5000 });
  });

  test('相手がいなければ引く相手の候補が空になること', async ({ page }) => {
    const hand = page.locator('app-hand-rail');
    await hand.locator('button[title="相手の手札から引く"]').click();

    const panel = page.locator('hand-draw-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(panel).toContainText('手札を持っている参加者がいません');
  });
});
