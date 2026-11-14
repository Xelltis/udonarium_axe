import { expect, Page, test } from '@playwright/test';

import { createCardStack, rightClickPiece, waitAppReady } from './helpers';

async function openCardStackMenu(page: Page) {
  await rightClickPiece(page.locator('card-stack').first());
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
