import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

async function openEffectLibrary(page: Page) {
  await openPanel(page, 'エフェクト');
  await expect(page.locator('app-effect-library-panel')).toBeVisible({ timeout: 5000 });
}

test.describe('map effects', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openEffectLibrary(page);
  });

  test('starts picking targets when an effect is chosen, and plays it on the board once a piece is picked', async ({
    page,
  }) => {
    const panel = page.locator('app-effect-library-panel');
    // A long single-target effect is used; a short one is gone right after it fires, before it can be checked.
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('一閃');
    await panel.getByRole('button', { name: /一閃/ }).first().click();

    // The hint for picking targets shows.
    await expect(page.getByText(/コマをクリックで順に選択/).first()).toBeVisible({ timeout: 5000 });

    // With a single target, it fires as soon as one piece is picked.
    // Sent straight to the piece's grab element: the host has no size, so a click would not land on it.
    await page.locator('game-character [appmovable]').first().dispatchEvent('mousedown', { button: 0, buttons: 1 });

    await expect(page.locator('table-effect-overlay > div').first()).toBeAttached({ timeout: 5000 });
  });
});
