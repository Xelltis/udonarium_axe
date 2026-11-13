import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from '../helpers';

/** An effect chosen from the library, played on a piece picked on the table, and drawn in the table's scene. */

type Hooks = {
  renderer(): string | null;
  sceneStats(): { effects: number } | null;
};

async function openEffectLibrary(page: Page) {
  await openPanel(page, 'エフェクト');
  await expect(page.locator('app-effect-library-panel')).toBeVisible({ timeout: 5000 });
}

/** How many particles and marks the effects draw in the table's scene now. */
function effectsDrawn(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.sceneStats()?.effects ?? 0);
}

test.describe('map effects', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
        timeout: 20000,
      })
      .not.toBeNull();
    await createCharacter(page);
    await openEffectLibrary(page);
  });

  test('starts picking targets when an effect is chosen, and plays it in the table’s scene once a piece is picked', async ({
    page,
  }) => {
    const panel = page.locator('app-effect-library-panel');
    // A long single-target effect is used; a short one is gone right after it fires, before it can be checked.
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('一閃');
    await panel.getByRole('button', { name: /一閃/ }).first().click();

    // The hint for picking targets shows.
    await expect(page.getByText(/コマをクリックで順に選択/).first()).toBeVisible({ timeout: 5000 });
    expect(await effectsDrawn(page)).toBe(0);

    // With a single target, it fires as soon as one piece is picked.
    // Sent straight to the piece's grab element: the host has no size, so a click would not land on it.
    await page.locator('game-character [appmovable]').first().dispatchEvent('mousedown', { button: 0, buttons: 1 });

    await expect.poll(() => effectsDrawn(page), { timeout: 5000 }).toBeGreaterThan(0);
    // Nothing of it is laid over the table: the table's scene draws it all.
    expect(await page.locator('table-effect-overlay [data-effect-sprite]').count()).toBe(0);
  });
});
