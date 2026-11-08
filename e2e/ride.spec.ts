import { expect, Locator, Page, test } from '@playwright/test';

import { openGroundAt, revealMenuEntry, spotOnPiece, waitAppReady } from './helpers';
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

/**
 * Drags from one point to another and leaves the pointer off the table, where the card of the piece
 * let go of would cover the next one reached for.
 */
async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(5, 400);
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

test.describe('mounts', () => {
  test('lets a piece get on a mount from the same spot, carries the mount along as the rider moves, and lets the rider get off', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);

    const rider = await pinnedPiece(page, 'キャラクターA');
    const mount = piece(page, 'キャラクターB');
    await settle(mount);
    await drag(page, await spotOnPiece(mount), await openGroundAt(page));
    await chooseRide(page, 'キャラクターB', '乗り物にする');
    await settle(rider);
    await settle(mount);
    await drag(page, await spotOnPiece(rider), await centreOf(pedestal(mount)));
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

  test('keeps the rider in the middle of a large mount however many times the mount is moved by hand, and gets the rider off where it is put down away from the mount', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    const mount = piece(page, 'モンスターC');
    const rider = await pinnedPiece(page, 'モンスターB');
    await chooseRide(page, 'モンスターC', '乗り物にする');
    await settle(rider);
    await drag(page, await spotOnPiece(rider), await centreOf(pedestal(mount)));
    await settle(rider);
    const offer = page.getByTestId('snackbar');
    await expect(offer).toContainText('モンスターB は モンスターC の上にいます', { timeout: 5000 });
    await offer.getByTestId('snackbar-action').click();
    const at = async (of: typeof mount) => {
      const [x, y] = (await placeOf(of)).split(',').map(Number);
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

    await settle(rider);
    await drag(page, await centreOf(rider.locator('[data-part="picture"]')), await openGroundAt(page));

    await expect(mount.getByTestId('piece-riders')).toHaveCount(0, { timeout: 5000 });
    await piece(page, 'モンスターB').dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('コマの状態', { exact: true }).hover();
    await expect(menu.locator('li', { hasText: '転んでいる' }).getByRole('checkbox')).not.toBeChecked({
      timeout: 5000,
    });
  });
});
