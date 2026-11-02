import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function createCircleRange(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '射程範囲を作成')).hover();
  await expect(menu.getByText('円形', { exact: true })).toBeVisible({ timeout: 5000 });
  await menu.getByText('円形', { exact: true }).click();
  await expect(page.locator('range').first()).toBeAttached({ timeout: 10000 });
}

async function createSquareRange(page: Page, as: 'ダイヤとして出力' | '四角形として出力') {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '射程範囲を作成')).hover();
  await menu.getByText('四角形・ダイヤ', { exact: true }).hover();
  await expect(menu.getByText(as, { exact: true })).toBeVisible({ timeout: 5000 });
  await menu.getByText(as, { exact: true }).click();
  await expect(page.locator('range').first()).toBeAttached({ timeout: 10000 });
}

async function openRangeMenu(page: Page) {
  await page.locator('range').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('the range (range-area) context menu', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCircleRange(page);
  });

  test('lists seven shapes in the "change shape" submenu', async ({ page }) => {
    const menu = await openRangeMenu(page);
    await menu.getByText('形状変更').hover();
    for (const shape of ['直線', 'コーン', '三角形', '四角形・ダイヤ', '五角形', '六角形', '円形']) {
      await expect(menu.getByText(shape)).toBeVisible({ timeout: 5000 });
    }
  });

  test('opens the detail panel from "edit range"', async ({ page }) => {
    const menu = await openRangeMenu(page);
    await menu.getByText('射程範囲を編集').click();
    // The range sheet is hosted on game-character-sheet too (the rangeArea === true path).
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });

  test('takes the range out of the DOM on "delete"', async ({ page }) => {
    const before = await page.locator('range').count();
    const menu = await openRangeMenu(page);
    await menu.getByText('削除する').click();
    await expect.poll(() => page.locator('range').count(), { timeout: 5000 }).toBeLessThan(before);
  });

  test('adds a range on "make a copy"', async ({ page }) => {
    const before = await page.locator('range').count();
    const menu = await openRangeMenu(page);
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('range').count(), { timeout: 5000 }).toBeGreaterThan(before);
  });
});

test.describe('square and diamond ranges', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('makes a diamond from "output as diamond" under "square/diamond" in the create menu, and marks the diamond in "change shape"', async ({
    page,
  }) => {
    await createSquareRange(page, 'ダイヤとして出力');

    const menu = await openRangeMenu(page);
    await menu.getByText('形状変更').hover();
    await menu.getByText('✔ 四角形・ダイヤ', { exact: true }).hover();
    await expect(menu.getByText('✔ ダイヤとして出力')).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('四角形として出力', { exact: true })).toBeVisible();
  });

  test('snaps to every 45° while Alt is held during a turn, and shows the angle and help while turning', async ({
    page,
  }) => {
    await createSquareRange(page, '四角形として出力');
    const range = page.locator('range').first();
    // The range turns about its own point, which is where the page draws that point of the floor.
    const [x, y, z] = (await range.locator('[data-location]').first().getAttribute('data-location'))!
      .split(',')
      .map(Number);
    const centre = await page.evaluate(
      ([x, y, z]) =>
        (
          window as unknown as {
            __axeTable: { surfacePageOf(surface: string, x: number, y: number, z: number): { x: number; y: number } };
          }
        ).__axeTable.surfacePageOf('floor', x, y, z),
      [x, y, z]
    );
    await page.mouse.move(centre.x, centre.y);
    const grab = range.locator('.rotate-grab').first();
    // Over a table drawn on a canvas the handle is put once the canvas draws the range.
    await expect(grab).toBeVisible();
    const box = await grab.boundingBox();
    if (!box) throw new Error('the range is not on screen');
    const cx = centre.x;
    const cy = centre.y;
    const radius = Math.hypot(box.x + box.width / 2 - cx, box.y + box.height / 2 - cy);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const hint = page.getByTestId('rotate-hint');
    for (const degrees of [-80, -70, -60]) {
      const rad = (degrees * Math.PI) / 180;
      await page.mouse.move(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius, { steps: 3 });
    }
    await expect(hint).toBeVisible();
    await expect(page.getByTestId('rotate-hint-snap')).toContainText('Alt を押しているあいだ 45° ごとにそろえる');
    const free = Number((await page.getByTestId('rotate-hint-angle').textContent())?.replace('°', ''));
    expect(free % 45).not.toBe(0);

    await page.keyboard.down('Alt');
    await expect(page.getByTestId('rotate-hint-snap')).toContainText('45° ごとにそろえています');
    const snapped = Number((await page.getByTestId('rotate-hint-angle').textContent())?.replace('°', ''));
    expect(snapped % 45).toBe(0);

    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(hint).toHaveCount(0);
  });
});
