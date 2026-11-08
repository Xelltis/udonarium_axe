import { expect, Page, test } from '@playwright/test';

import { createCharacter, revealMenuEntry, waitAppReady } from './helpers';

async function openBuffView(page: Page) {
  await waitAppReady(page);
  await createCharacter(page);
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  await (await revealMenuEntry(page, page.locator('context-menu'), 'バフ編集')).click();
  await expect(page.locator('game-character-buff-view')).toBeVisible({ timeout: 5000 });
}

test.describe('the buff editing view (game-character-buff-view)', () => {
  test.beforeEach(async ({ page }) => {
    await openBuffView(page);
  });

  test('turns the round badge on the piece to the colour picked for it', async ({ page }) => {
    await page
      .locator('game-character-buff-view')
      .getByRole('button', { name: /バフを追加/ })
      .click();

    const view = page.locator('game-character-buff-view');
    const picker = view.locator('details').first();
    await picker.locator('summary').click();
    await picker.locator('button[title="red"]').click();
    await expect(picker.locator('summary')).toHaveCSS('background-color', 'rgb(198, 40, 40)', { timeout: 5000 });

    const badge = page.locator('game-character').first().locator('[data-testid="buff-badge"] > span').first();
    await expect(badge).toBeAttached({ timeout: 5000 });

    await expect(badge).toHaveCSS('background-color', 'rgb(198, 40, 40)', { timeout: 5000 });

    const shape = await badge.evaluate((element) => {
      const computed = getComputedStyle(element as HTMLElement);
      return { radius: parseFloat(computed.borderRadius), width: element.clientWidth };
    });

    expect(shape.radius, 'バッジが丸くない').toBeGreaterThanOrEqual(shape.width / 2 - 1);
  });
});
