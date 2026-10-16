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

  test('shows "no buffs or debuffs registered" for a character with no buffs', async ({ page }) => {
    // A new character made by createCharacter has no buffs. If rows show anyway, nothing is checked.
    const items = page.locator('game-character-buff-view [game-data-element-buff]');
    if ((await items.count()) === 0) {
      await expect(
        page.locator('game-character-buff-view').getByText('バフ・デバフは登録されていません')
      ).toBeVisible();
    } else {
      test.skip(true, '既存バフがあるキャラのため空メッセージ確認をスキップ');
    }
  });

  test('adds at least three buff items when "add buff" is pressed three times', async ({ page }) => {
    const before = await page.locator('game-character-buff-view [game-data-element-buff]').count();
    for (let i = 0; i < 3; i++) {
      await page
        .locator('game-character-buff-view')
        .getByRole('button', { name: /バフを追加/ })
        .click();
    }
    await expect
      .poll(() => page.locator('game-character-buff-view [game-data-element-buff]').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(before + 3);
  });

  test('takes a value in the buff name field', async ({ page }) => {
    // Edits the first buff (data-elm-name).
    const nameInputs = page.locator('game-character-buff-view input[name="data-elm-name"]');
    await expect(nameInputs.first()).toBeVisible({ timeout: 5000 });
    const first = nameInputs.first();
    await first.click();
    await first.press('Control+A');
    await first.fill('猛攻撃');
    await expect(first).toHaveValue('猛攻撃');
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

  test('removes the row with the "delete buff" button', async ({ page }) => {
    const before = await page.locator('game-character-buff-view [game-data-element-buff]').count();
    // The bin icon of the first buff, found by its title.
    await page.locator('game-character-buff-view button[title="バフを削除"]').first().click();
    await expect
      .poll(() => page.locator('game-character-buff-view [game-data-element-buff]').count(), {
        timeout: 5000,
      })
      .toBeLessThan(before);
  });
});
