import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

async function createCardStack(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('トランプの山札を作成').click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
}

async function openCardStackMenu(page: Page) {
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('カード枚指定ダイアログ (card-draw-count-dialog)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
  });

  test('「X枚を引く」で枚数入力ダイアログが開けること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    await expect(page.locator('card-draw-count-dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('card-draw-count-dialog input[name="draw-count"]')).toBeVisible();
    await expect(page.locator('card-draw-count-dialog').getByRole('button', { name: '引く' })).toBeVisible();
    await expect(page.locator('card-draw-count-dialog').getByRole('button', { name: 'キャンセル' })).toBeVisible();
  });

  test('枚数入力欄に数値を入力できること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    const input = page.locator('card-draw-count-dialog input[name="draw-count"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    // autofocusされており既定値が入っているので、select-allしてから書き換える。
    await input.click();
    await input.press('Control+A');
    await input.fill('5');
    await expect(input).toHaveValue('5');
  });

  test('「キャンセル」ボタンでダイアログが閉じること', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    await expect(page.locator('card-draw-count-dialog')).toBeVisible({ timeout: 5000 });
    await page.locator('card-draw-count-dialog').getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.locator('card-draw-count-dialog')).toHaveCount(0, { timeout: 5000 });
  });

  test('「引く」で指定枚数分の card 要素が増えること', async ({ page }) => {
    const initialCardCount = await page.locator('card').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    const input = page.locator('card-draw-count-dialog input[name="draw-count"]');
    await expect(input).toBeVisible({ timeout: 5000 });

    // type=numberの入力にfill()で値を入れてもngModelには届かず、既定の2枚の
    // まま引かれてしまう。人と同じように打ち込む。
    await input.click();
    await input.press('Control+a');
    await input.pressSequentially('3');
    await expect(input).toHaveValue('3');
    await page.locator('card-draw-count-dialog').getByRole('button', { name: '引く' }).click();
    await expect
      .poll(() => page.locator('card').count(), { timeout: 7000 })
      .toBeGreaterThanOrEqual(initialCardCount + 3);
  });
});

test.describe('「山札を崩す」で個別 card 操作が可能になる', () => {
  test('山札を崩すと card 要素が大量に出現すること', async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
    const initialCardCount = await page.locator('card').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('山札を崩す').click();
    // 標準的な52枚とジョーカーの山札を想定し、十分多くのcardが現れる。
    await expect.poll(() => page.locator('card').count(), { timeout: 10000 }).toBeGreaterThan(initialCardCount + 10);
  });
});
