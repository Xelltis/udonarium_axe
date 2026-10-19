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

test.describe('the dialog for drawing a number of cards (card-draw-count-dialog)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
  });

  test('opens the count dialog from "draw X cards"', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    await expect(page.locator('card-draw-count-dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('card-draw-count-dialog input[name="draw-count"]')).toBeVisible();
    await expect(page.locator('card-draw-count-dialog').getByRole('button', { name: '引く' })).toBeVisible();
    await expect(page.locator('card-draw-count-dialog').getByRole('button', { name: 'キャンセル' })).toBeVisible();
  });

  test('takes a number in the count field', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    const input = page.locator('card-draw-count-dialog input[name="draw-count"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    // The field has the focus and a default value in it, so it is selected whole before being typed over.
    await input.click();
    await input.press('Control+A');
    await input.fill('5');
    await expect(input).toHaveValue('5');
  });

  test('closes the dialog with the cancel button', async ({ page }) => {
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    await expect(page.locator('card-draw-count-dialog')).toBeVisible({ timeout: 5000 });
    await page.locator('card-draw-count-dialog').getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.locator('card-draw-count-dialog')).toHaveCount(0, { timeout: 5000 });
  });

  test('adds as many card elements as asked for on "draw"', async ({ page }) => {
    const initialCardCount = await page.locator('card').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('X枚を引く').click();
    const input = page.locator('card-draw-count-dialog input[name="draw-count"]');
    await expect(input).toBeVisible({ timeout: 5000 });

    // A value put into a type=number input with fill() never reaches ngModel, and the default two
    // cards are drawn instead. It is typed in as a person would.
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

test.describe('handling single cards after breaking up the deck', () => {
  test('puts a great many card elements out when the deck is broken up', async ({ page }) => {
    await waitAppReady(page);
    await createCardStack(page);
    const initialCardCount = await page.locator('card').count();
    const menu = await openCardStackMenu(page);
    await menu.getByText('山札を崩す').click();
    // A standard deck of 52 cards and jokers is assumed, so plenty of cards appear.
    await expect.poll(() => page.locator('card').count(), { timeout: 10000 }).toBeGreaterThan(initialCardCount + 10);
  });
});
