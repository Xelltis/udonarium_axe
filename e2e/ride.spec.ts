import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';
import { centreOf, pedestal, piece, pinnedPiece, Point, settle } from './see-through-helpers';

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

/** Chooses an entry of a piece's riding group: a piece named, or one already found. */
async function chooseRide(page: Page, who: string | Locator, entry: string | RegExp) {
  await (typeof who === 'string' ? piece(page, who) : who).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('乗り物', { exact: true }).hover();
  await menu.getByText(entry).click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
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
  await chooseRide(page, 'キャラクターA', 'キャラクターB に乗る');
  await expect(mount.getByTestId('piece-riders').first()).toContainText('1', { timeout: 5000 });
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

  test('乗り物が転ぶと乗り手が落ちて、転んでいる状態になること', async ({ page }) => {
    await rideAOnB(page);
    const mount = piece(page, 'キャラクターB');

    await chooseRide(page, 'キャラクターB', '転んでいる');

    await expect(mount.getByTestId('piece-riders')).toHaveCount(0, { timeout: 5000 });
    await piece(page, 'キャラクターA').dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('乗り物', { exact: true }).hover();
    await expect(menu.locator('li', { hasText: '転んでいる' }).getByRole('checkbox')).toBeChecked({ timeout: 5000 });
    await expect(menu.getByText('キャラクターB から降りる')).toHaveCount(0);
  });
});
