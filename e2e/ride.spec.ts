import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, revealMenuEntry, waitAppReady } from './helpers';
import { centreOf, pedestal, piece, pinnedPiece, placeOf, Point, settle } from './see-through-helpers';

async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await expect(panels).toHaveCount(0);
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * Chooses a riding entry of a piece's menu, a piece named or one already found: getting on or off
 * stands on the first level, the rest in the group it is gathered in.
 */
async function chooseRide(page: Page, who: string | Locator, entry: string) {
  await (typeof who === 'string' ? piece(page, who) : who).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await (await revealMenuEntry(page, menu, entry)).click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
  // Off whatever piece the menu left the pointer over, whose card would cover the next one reached for.
  await page.mouse.move(5, 400);
}

/** Makes キャラクターB a mount and gets キャラクターA on it in front. */
async function rideAOnB(page: Page) {
  await waitAppReady(page);
  await becomeGm(page);
  await closePanels(page);
  const rider = await pinnedPiece(page, 'キャラクターA');
  const mount = piece(page, 'キャラクターB');
  await chooseRide(page, 'キャラクターB', '乗り物にする');
  await settle(rider);
  await settle(mount);
  await drag(page, await centreOf(pedestal(rider)), await centreOf(pedestal(mount)));
  await settle(rider);
  const offer = page.getByTestId('snackbar');
  await expect(offer).toContainText('キャラクターA は キャラクターB の上にいます', { timeout: 5000 });
  await offer.getByTestId('snackbar-action').click();
  await expect(mount.getByTestId('piece-riders').first()).toContainText('1', { timeout: 5000 });
  // Up onto the mount the rider still rises, and a hand reaching for it before it has risen takes
  // hold of the mount below it.
  await settle(rider);
}

test.describe('乗り物', () => {
  test('乗り物にした駒に同じ点から乗ると、乗り手の移動で乗り物ごと動き、降りられること', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);

    const rider = await pinnedPiece(page, 'キャラクターA');
    const mount = piece(page, 'キャラクターB');
    await chooseRide(page, 'キャラクターB', '乗り物にする');
    await settle(rider);
    await settle(mount);
    await drag(page, await centreOf(pedestal(rider)), await centreOf(pedestal(mount)));
    await settle(rider);

    await chooseRide(page, 'キャラクターA', 'キャラクターB に乗る');
    await expect(mount.getByTestId('piece-riders').first()).toContainText('1', { timeout: 5000 });

    await settle(mount);
    const start = await centreOf(pedestal(mount));
    const cell = (await pedestal(rider).boundingBox())!.width;
    await rider.dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('移動', { exact: true }).click();
    const target = { x: start.x - cell * 2, y: start.y };
    await page.mouse.move(target.x, target.y, { steps: 4 });
    await page.mouse.click(target.x, target.y);

    await expect.poll(async () => (await centreOf(pedestal(mount))).x, { timeout: 10000 }).toBeLessThan(start.x - cell);
    await settle(rider);
    await settle(mount);
    const [riderAt, mountAt] = [await centreOf(pedestal(rider)), await centreOf(pedestal(mount))];
    expect(Math.abs(riderAt.x - mountAt.x)).toBeLessThan(cell / 2);

    await chooseRide(page, rider, 'キャラクターB から降りる');
    await expect(mount.getByTestId('piece-riders')).toHaveCount(0, { timeout: 5000 });
  });

  test('乗られている乗り物は行動順から外れ、ラウンド表示で乗り手の丸に重なること', async ({ page }) => {
    await rideAOnB(page);

    await openPanel(page, 'インベントリ');
    const panel = page.locator('ui-panel').filter({ hasText: 'インベントリ' });
    await panel.locator('button[title="リッチ表示"]').dispatchEvent('click');
    await panel.locator('button[title="簡略表示（表）"]').dispatchEvent('click');
    await expect(panel.locator('button[title="ラウンド表示"]')).toHaveCount(1, { timeout: 10000 });

    await expect(panel.locator('[data-testid="turn-companions"] [title="キャラクターB"]')).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(panel.locator('button[title="キャラクターA"]')).toHaveCount(1);
    await expect(panel.locator('button[title="キャラクターB"]')).toHaveCount(0);
  });

  test('乗り物が転ぶと乗り手が落ちて転び、乗り物が起きれば起き上がって乗り直せること', async ({ page }) => {
    await rideAOnB(page);
    const mount = piece(page, 'キャラクターB');

    await chooseRide(page, 'キャラクターB', '転んでいる');

    await expect(mount.getByTestId('piece-riders')).toHaveCount(0, { timeout: 5000 });
    await piece(page, 'キャラクターA').dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('駒の状態', { exact: true }).hover();
    await expect(menu.locator('li', { hasText: '転んでいる' }).getByRole('checkbox')).toBeChecked({ timeout: 5000 });
    await expect(menu.getByText('キャラクターB から降りる')).toHaveCount(0);

    await chooseRide(page, 'キャラクターB', '転んでいる');
    await chooseRide(page, 'キャラクターA', '起き上がって キャラクターB に乗る');
    await expect(mount.getByTestId('piece-riders').first()).toContainText('1', { timeout: 5000 });
  });

  test('乗っている駒を手で乗り物から離して置くと、そこで降りること', async ({ page }) => {
    await rideAOnB(page);
    const mount = piece(page, 'キャラクターB');
    const rider = page.locator('game-character[data-e2e-pinned="キャラクターA"]');
    const from = await centreOf(rider.locator('img.image'));
    const cell = (await pedestal(mount).boundingBox())!.width;

    await drag(page, from, { x: from.x - cell * 3, y: from.y });

    await expect(mount.getByTestId('piece-riders')).toHaveCount(0, { timeout: 5000 });
    await piece(page, 'キャラクターA').dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('駒の状態', { exact: true }).hover();
    await expect(menu.locator('li', { hasText: '転んでいる' }).getByRole('checkbox')).not.toBeChecked({
      timeout: 5000,
    });
  });

  test('大きな乗り物を手で何度動かしても、乗り手は乗り物の真ん中に乗ったままであること', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    const mount = piece(page, 'モンスターC');
    const rider = await pinnedPiece(page, 'モンスターB');
    await chooseRide(page, 'モンスターC', '乗り物にする');
    await settle(rider);
    await drag(page, await centreOf(rider.locator('img.image')), await centreOf(pedestal(mount)));
    await settle(rider);
    const offer = page.getByTestId('snackbar');
    await expect(offer).toContainText('モンスターB は モンスターC の上にいます', { timeout: 5000 });
    await offer.getByTestId('snackbar-action').click();
    const at = async (of: typeof mount) => {
      const [x, y] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/
        .exec(await placeOf(of))!
        .slice(1)
        .map(Number);
      return { x, y };
    };
    const gap = async () => {
      const [m, r] = [await at(mount), await at(rider)];
      return `${r.x - m.x},${r.y - m.y}`;
    };
    await expect.poll(gap, { timeout: 5000 }).toBe('50,50');

    for (const [dx, dy] of [
      [130, 70],
      [110, -40],
      [-170, 90],
    ]) {
      const box = (await pedestal(mount).boundingBox())!;
      const from = { x: box.x + box.width * 0.85, y: box.y + box.height * 0.5 };
      await drag(page, from, { x: from.x + dx, y: from.y + dy });
      await settle(mount);
      await expect.poll(gap, { timeout: 5000 }).toBe('50,50');
    }
  });
});
