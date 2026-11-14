import { expect, Locator, Page, test } from '@playwright/test';

import {
  becomeGm,
  closePanels,
  dragAndLeave,
  openGroundAt,
  revealMenuEntry,
  rightClickPiece,
  spotOnPiece,
  waitAppReady,
} from './helpers';
import { centreOf, pedestal, piece, pinnedPiece, placeOf, settle } from './see-through-helpers';

/**
 * Chooses a riding entry of a piece's menu, a piece named or one already found: getting on or off
 * stands on the first level, the rest in the group it is gathered in.
 */
async function chooseRide(page: Page, who: string | Locator, entry: string) {
  await rightClickPiece(typeof who === 'string' ? piece(page, who) : who);
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
    await dragAndLeave(page, await spotOnPiece(mount), await openGroundAt(page));
    await chooseRide(page, 'キャラクターB', '乗り物にする');
    await settle(rider);
    await settle(mount);
    await dragAndLeave(page, await spotOnPiece(rider), await centreOf(pedestal(mount)));
    await settle(rider);

    await chooseRide(page, 'キャラクターA', 'キャラクターB に乗る');
    await expect(mount.getByTestId('piece-riders').first()).toContainText('1', { timeout: 5000 });

    await settle(mount);
    const start = await centreOf(pedestal(mount));
    const cell = (await pedestal(rider).boundingBox())!.width;
    await rightClickPiece(rider);
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
    await dragAndLeave(page, await spotOnPiece(rider), await centreOf(pedestal(mount)));
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
      await dragAndLeave(page, from, { x: from.x + dx, y: from.y + dy });
      await settle(mount);
      await expect.poll(gap, { timeout: 5000 }).toBe('50,50');
    }

    await settle(rider);
    await dragAndLeave(page, await centreOf(rider.locator('[data-part="picture"]')), await openGroundAt(page));

    await expect(mount.getByTestId('piece-riders')).toHaveCount(0, { timeout: 5000 });
    await rightClickPiece(piece(page, 'モンスターB'));
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('コマの状態', { exact: true }).hover();
    await expect(menu.locator('li', { hasText: '転んでいる' }).getByRole('checkbox')).not.toBeChecked({
      timeout: 5000,
    });
  });
});
