import { expect, test } from '@playwright/test';

import { openPanel, panelAtRest, waitAppReady } from './helpers';

test.describe('the turn on the player tools', () => {
  test('a player looks to the piece whose turn it is, and hands on their own character’s turn from the bar', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*PL\s*$/ })
      .click();
    const bar = page.locator('app-pl-toolbar');
    const owned = bar.locator('[title="所有キャラクター一覧"]');
    await expect(owned).toBeVisible({ timeout: 10000 });
    await owned.click();
    const claimable = page.getByTestId('claimable-character').first();
    await expect(claimable).toBeVisible({ timeout: 10000 });
    const name = (await claimable.locator('span').last().textContent())!.trim();
    await claimable.getByRole('button', { name: '自分のものにする' }).click();

    await openPanel(page, 'インベントリ');
    const panel = page.locator('ui-panel').filter({ has: page.locator('game-object-inventory') });
    await panel.locator('button[title="リッチ表示"]').dispatchEvent('click');
    await panel.locator('button[title="簡略表示（表）"]').dispatchEvent('click');
    const round = page.locator('inventory-round-view');
    await round.getByRole('button', { name: '次へ', exact: true }).dispatchEvent('click');
    const face = round.locator(`[data-turn-piece][aria-label^="${name}"]`);
    const identifier = (await face.getAttribute('data-turn-piece'))!;
    await face.dispatchEvent('click');
    await panelAtRest(round.getByTestId('turn-pieces'));

    const focus = bar.getByTestId('pl-turn-focus');
    await expect(focus).toHaveText(name);
    const viewport = page.viewportSize()!;
    /** How far the middle of a piece, the one whose turn it is unless another is named, lies from the middle of the screen. */
    const offCentre = async (of = identifier) => {
      const boxes = await page.evaluate(
        (id) =>
          (
            window as unknown as {
              __axeTable: { pieceBoxesOnPage(id: string): { x: number; y: number; width: number; height: number }[] };
            }
          ).__axeTable.pieceBoxesOnPage(id),
        of
      );
      const box = boxes[0];
      if (!box) return Number.POSITIVE_INFINITY;
      return Math.hypot(box.x + box.width / 2 - viewport.width / 2, box.y + box.height / 2 - viewport.height / 2);
    };
    // The view is moved off the piece first, by the keys that move it.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let press = 0; press < 100 && (await offCentre()) < 250; press++) {
      await page.keyboard.press('ArrowRight');
    }
    expect(await offCentre()).toBeGreaterThanOrEqual(250);

    await focus.click();
    await expect.poll(() => offCentre(), { timeout: 10000 }).toBeLessThan(80);

    const next = bar.getByTestId('pl-turn-next');
    await expect(next).toBeVisible();
    await next.click();
    await expect(focus).not.toHaveText(name);
    await expect(next).toBeHidden();

    // The view goes on to the piece whose turn begins, as every screen's does by default.
    const up = (await round.locator('[data-turn-piece][data-current]').getAttribute('data-turn-piece'))!;
    expect(up).not.toBe(identifier);
    await expect.poll(() => offCentre(up), { timeout: 10000 }).toBeLessThan(80);
  });
});
