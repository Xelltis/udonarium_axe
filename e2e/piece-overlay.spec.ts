import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/** The toolbar switches the resource bars and the buffs over the pieces off and on, for this screen alone. */
test.describe('リソースバーとバフの表示切り替え', () => {
  test('PL ツールバーから一瞬で隠せて、リロードしても隠したままで、もう一度押すと戻ること', async ({ page }) => {
    await waitAppReady(page);
    const toolbar = page.locator('app-pl-toolbar');
    const gauges = page.locator('game-character [data-testid="piece-gauge"]');
    const badges = page.locator('game-character [data-testid="buff-badge"]');
    await expect(gauges.first()).toBeAttached({ timeout: 10000 });
    await expect(badges.first()).toBeAttached();

    await toolbar.getByTestId('toolbar-resource-bars').click();
    await expect(gauges).toHaveCount(0);
    await expect(badges.first()).toBeAttached();

    await toolbar.getByTestId('toolbar-buffs').click();
    await expect(badges).toHaveCount(0);

    await expect.poll(() => page.evaluate(() => localStorage.getItem('ui-piece-overlay'))).toContain('false');
    await page.reload();
    await waitAppReady(page);
    await expect(toolbar.getByTestId('toolbar-buffs')).toBeVisible({ timeout: 10000 });
    await expect(gauges).toHaveCount(0);
    await expect(badges).toHaveCount(0);

    await toolbar.getByTestId('toolbar-resource-bars').click();
    await toolbar.getByTestId('toolbar-buffs').click();
    await expect(gauges.first()).toBeAttached();
    await expect(badges.first()).toBeAttached();
  });
});

/** The toolbar switches the names over the pieces off and on in the same way. */
test.describe('名前の表示切り替え', () => {
  test('PL ツールバーから全員の名前をまとめて隠せて、リロードしても隠したままで、もう一度押すと戻ること', async ({
    page,
  }) => {
    await waitAppReady(page);
    const toolbar = page.locator('app-pl-toolbar');
    const names = page.locator('game-character [data-testid="piece-name"]');
    const gauges = page.locator('game-character [data-testid="piece-gauge"]');
    await expect(names.first()).toBeAttached({ timeout: 10000 });

    await toolbar.getByTestId('toolbar-names').click();
    await expect(names).toHaveCount(0);
    await expect(gauges.first()).toBeAttached();

    await page.reload();
    await waitAppReady(page);
    await expect(toolbar.getByTestId('toolbar-names')).toBeVisible({ timeout: 10000 });
    await expect(names).toHaveCount(0);

    await toolbar.getByTestId('toolbar-names').click();
    await expect(names.first()).toBeAttached();
  });
});
