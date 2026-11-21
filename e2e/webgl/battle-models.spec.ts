import { expect, Page, test } from '@playwright/test';

import { drawSampleModels, openPanel, waitAppReady } from '../helpers';

/**
 * The battle stage with fighters whose pieces are drawn as 3D models: each stands as its model, read
 * and drawn as the table draws it, in place of its picture.
 */
test.describe('the battle cut-in with pieces drawn as models', () => {
  async function becomeGameMaster(page: Page) {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await expect(page.locator('gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
  }

  test('stands both sides as their models, the picture of each left undrawn once its model stands', async ({
    page,
  }) => {
    await drawSampleModels(page);
    await waitAppReady(page);
    await expect
      .poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.models ?? 0), { timeout: 30000 })
      .toBe(9);
    await becomeGameMaster(page);
    await openPanel(page, '戦闘カットイン');
    const panel = page.getByTestId('battle-cut-in-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    await panel.getByTestId('battle-to-left-騎士').dispatchEvent('click');
    await panel.getByTestId('battle-to-right-オーク').dispatchEvent('click');
    await expect(panel.getByTestId('battle-cut-in-bout')).toContainText('騎士 → オーク');

    await panel.getByTestId('battle-cut-in-play-here').dispatchEvent('click');

    const stage = page.getByTestId('battle-cut-in');
    await expect(stage).toBeVisible({ timeout: 10000 });
    await expect(stage.getByTestId('battle-plate')).toHaveCount(2);
    const bodies = stage.locator('[data-testid^="battle-figure-"] > div');
    await expect(bodies).toHaveCount(2);
    await expect(bodies.first()).toHaveClass(/invisible/, { timeout: 15000 });
    await expect(bodies.last()).toHaveClass(/invisible/);
  });
});
