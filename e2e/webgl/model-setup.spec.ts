import { expect, Page, test } from '@playwright/test';

import { drawSampleModels, revealMenuEntry, sendMenuEvent, waitAppReady } from '../helpers';

/**
 * Setting up the model a piece is drawn as, from the piece's sheet: the setting up is opened beside
 * a preview that draws the model as the table does, and what is chosen there is kept by the piece.
 */

function knight(page: Page) {
  return page.locator('game-character').filter({ hasText: '騎士' }).first();
}

/** What the knight keeps of its model: its look, its motions in a fight, and what it does with its shapes. */
function kept(page: Page): Promise<{ look: string; motions: string }> {
  return knight(page).evaluate((element) => {
    const id = element.getAttribute('data-object-id')!;
    return window.__axeTable.modelFieldsOf(id);
  });
}

test.describe('setting up the model of a piece', () => {
  test.beforeEach(async ({ page }) => {
    await drawSampleModels(page);
    await waitAppReady(page);
    await expect
      .poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.models ?? 0), { timeout: 30000 })
      .toBe(9);
    await sendMenuEvent(knight(page));
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, menu, '詳細を表示', true)).click();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await sheet.getByRole('button', { name: '設定' }).click();
    await sheet.getByTestId('piece-model-setup').locator('summary').click();
  });

  test('draws the model in a preview, and keeps the ready-made look chosen for it', async ({ page }) => {
    const sheet = page.locator('game-character-sheet');
    await expect(sheet.getByTestId('model-preview')).toHaveAttribute('data-state', 'shown', { timeout: 30000 });

    await sheet.getByTestId('model-look-preset').selectOption({ label: '黄金' });

    await expect.poll(async () => (await kept(page)).look).toContain('"metalness":1');
    await expect(sheet.getByTestId('model-preview')).toHaveAttribute('data-state', 'shown');
    await expect.poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.models ?? 0)).toBe(9);
  });

  test('says the bundled figure has no motions of its own, lets a blow be tried, and turns moving it by hand off', async ({
    page,
  }) => {
    const sheet = page.locator('game-character-sheet');
    await expect(sheet.getByTestId('model-preview')).toHaveAttribute('data-state', 'shown', { timeout: 30000 });
    await expect(sheet.getByText('このモデルは動きを持っていません。')).toBeVisible();

    await sheet.getByTestId('piece-model-try-attack').click();
    await expect(sheet.getByTestId('model-preview')).toHaveAttribute('data-state', 'shown');

    await sheet.getByTestId('piece-model-made').uncheck();
    await expect.poll(async () => (await kept(page)).motions).toBe('{"made":false}');
    await expect(sheet.getByTestId('piece-model-try-attack')).toBeDisabled();
  });
});
