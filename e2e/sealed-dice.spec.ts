import { expect, Page, test } from '@playwright/test';

import { createDiceSymbol, rightClickPiece, waitAppReady } from './helpers';

/** Chooses an entry of the menu a right-click on the die opens. */
async function choose(page: Page, entry: string): Promise<void> {
  await rightClickPiece(page.locator('dice-symbol').last());
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText(entry, { exact: true }).click();
  await expect(menu).toHaveCount(0, { timeout: 5000 });
}

test.describe('a die sealed from the game master too', () => {
  test('tells its throws as throws alone, shows its face to its keeper, and says the face once shown', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ui-lang', 'ja');
      localStorage.setItem('ui-motion', 'off');
    });
    await waitAppReady(page);
    await createDiceSymbol(page);

    await choose(page, '自分だけ見る（GMにも隠す）');
    await choose(page, 'ダイスを振る');
    const thrown = page
      .locator('chat-window')
      .getByText(/伏せたダイス1個を振りました/)
      .last();
    await expect(thrown).toBeVisible({ timeout: 10000 });
    await expect(thrown).not.toContainText('→');

    await choose(page, '詳細を表示');
    const sheet = page.locator('dice-symbol-sheet');
    await expect(sheet.getByTestId('dice-sealed-note')).toBeVisible({ timeout: 10000 });
    const face = (
      await sheet
        .getByText(/現在の面/)
        .locator('strong')
        .innerText()
    ).trim();
    expect(face).toMatch(/^[1-6]$/);
    await page.locator('ui-panel', { has: sheet }).getByTestId('panel-close').first().dispatchEvent('click');
    await expect(sheet).toHaveCount(0);

    await choose(page, 'ダイスを公開');
    await expect(page.locator('chat-window').getByText(`の出目は ${face} です`).last()).toBeVisible({
      timeout: 10000,
    });
  });
});
