import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/**
 * Darkness used to be switched on by reaching into the component through
 * `window.ng.getComponent`, which only exists in a development build. The suite
 * now runs against the production bundle, so this drives the GM toolbar the way
 * a game master would.
 */
test.describe('darkness (a stage effect)', () => {
  /** How many times the scene of the table has been handed the darkness to light itself by. */
  const paintedPixels = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const scene = (
        window as unknown as { __axeTable?: { sceneStats(): { lightMapRevision: number } | null } }
      ).__axeTable?.sceneStats();
      return scene?.lightMapRevision ?? 0;
    });

  test('draws the overlay from the darkness button of the GM toolbar', async ({ page }) => {
    await waitAppReady(page);

    // Only the GM can switch the darkness.
    const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();
    const darkness = page.locator('app-gm-toolbar [title^="暗闇"]');
    await expect(darkness).toBeVisible({ timeout: 10000 });

    await expect(page.locator('table-vision-overlay canvas')).toBeAttached({ timeout: 10000 });
    expect(await paintedPixels(page)).toBe(0);

    await darkness.click();
    await expect.poll(() => paintedPixels(page), { timeout: 10000 }).toBeGreaterThan(0);

    // Pressing it again turns it back.
    await darkness.click();
    await expect.poll(() => paintedPixels(page), { timeout: 10000 }).toBe(0);
  });
});
