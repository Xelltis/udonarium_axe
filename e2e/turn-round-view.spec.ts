import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

test.describe('the turn order of a round of many pieces', () => {
  test('gathers the pieces done and those far off, and hands the turn to one far off from its row', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, 'インベントリ');
    const panel = page.locator('ui-panel').filter({ has: page.locator('game-object-inventory') });
    await panel.locator('button[title="リッチ表示"]').dispatchEvent('click');
    await panel.locator('button[title="簡略表示（表）"]').dispatchEvent('click');
    const round = page.locator('inventory-round-view');
    const pieces = round.getByTestId('turn-pieces');
    await expect(pieces).toBeVisible();

    const next = round.getByRole('button', { name: '次へ' });
    for (let turn = 0; turn < 4; turn++) await next.dispatchEvent('click');
    await expect(round.locator('[data-testid="turn-gathered"][data-gathered="acted"]')).toBeVisible();
    const later = round.locator('[data-testid="turn-gathered"][data-gathered="later"]');
    await expect(later).toBeVisible();
    await expect(round.locator('[data-turn-piece]')).toHaveCount(5);
    expect((await pieces.boundingBox())!.height).toBeLessThan(480);

    await later.dispatchEvent('click');
    const far = round.locator('[data-turn-piece]').last();
    const farOne = (await far.getAttribute('data-turn-piece'))!;
    await far.dispatchEvent('click');

    await expect(round.locator(`[data-turn-piece="${farOne}"]`)).toHaveClass(/scale-105/);
    await round.getByTestId('turn-fold').dispatchEvent('click');
    await expect(later).toBeVisible();
  });
});
