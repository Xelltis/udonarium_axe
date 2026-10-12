import { expect, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';
import { centreOf, pedestal, piece, Point, settle } from './see-through-helpers';

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

/** Chooses an entry of a piece's riding group. */
async function chooseRide(page: Page, name: string, entry: string | RegExp) {
  await piece(page, name).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('乗り物', { exact: true }).hover();
  await menu.getByText(entry).click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

test.describe('乗り物', () => {
  test('乗り物にした駒に同じ点から乗ると、乗り手の移動で乗り物ごと動き、降りられること', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);

    const rider = piece(page, 'キャラクターA');
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

    await chooseRide(page, 'キャラクターA', 'キャラクターB から降りる');
    await expect(mount.getByTestId('piece-riders')).toHaveCount(0, { timeout: 5000 });
  });
});
