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
