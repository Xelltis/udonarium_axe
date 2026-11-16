import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from '../helpers';

/** An effect chosen from the library, played on a piece picked on the table, and drawn in the table's scene. */

async function openEffectLibrary(page: Page) {
  await openPanel(page, 'エフェクト');
  await expect(page.locator('effect-library-panel')).toBeVisible({ timeout: 5000 });
}

/** How many particles and marks the effects draw in the table's scene now. */
function effectsDrawn(page: Page): Promise<number> {
  return page.evaluate(() => window.__axeTable?.sceneStats()?.effects ?? 0);
}

test.describe('map effects', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect
      .poll(() => page.evaluate(() => window.__axeTable?.renderer() ?? null), {
        timeout: 20000,
      })
      .not.toBeNull();
    await createCharacter(page);
    await openEffectLibrary(page);
  });

  test('starts picking targets when an effect is chosen, and plays it in the table’s scene once it is cast at the piece picked', async ({
    page,
  }) => {
    const panel = page.locator('effect-library-panel');
    // A long single-target effect is used; a short one is gone right after it fires, before it can be checked.
    await panel.getByPlaceholder(/名前・系統/).fill('一閃');
    await panel.getByRole('button', { name: /一閃/ }).first().click();

    // The hint for picking targets shows.
    await expect(page.getByText(/コマを押して対象を選ぶ/).first()).toBeVisible({ timeout: 5000 });
    expect(await effectsDrawn(page)).toBe(0);

    // Sent straight to the piece's grab element: the host has no size, so a click would not land on it.
    await page.locator('game-character [appmovable]').first().dispatchEvent('mousedown', { button: 0, buttons: 1 });
    await page.locator('game-character [appmovable]').first().dispatchEvent('mouseup', { button: 0 });

    // Picking the one target it takes casts nothing; the button casts it.
    const fire = panel.getByTestId('effect-library-fire');
    await expect(fire).toBeEnabled({ timeout: 5000 });
    expect(await effectsDrawn(page)).toBe(0);
    await fire.click();

    await expect.poll(() => effectsDrawn(page), { timeout: 5000 }).toBeGreaterThan(0);
    // Nothing of it is laid over the table: the table's scene draws it all.
    expect(await page.locator('table-effect-overlay [data-effect-sprite]').count()).toBe(0);
  });
});
