import { expect, Page, test } from '@playwright/test';

import { openGroundAt, revealMenuEntry, spotOnPiece, waitAppReady } from './helpers';
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

/** Drags from one point to another and leaves the pointer off the table. */
async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(5, 400);
}

/** Chooses an entry of the menu a right-click on an element opens, and leaves the pointer off the table. */
async function chooseFrom(page: Page, on: ReturnType<Page['locator']>, entry: string) {
  await on.dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await (await revealMenuEntry(page, menu, entry)).click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
  await page.mouse.move(5, 400);
}

test.describe('the parts of a piece', () => {
  test('makes a piece a part of one it stands on, lists it under the body to aim at, lays its picture over the body, carries it along, and takes it off', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);

    const part = piece(page, 'キャラクターA');
    const body = piece(page, 'キャラクターB');
    await settle(body);
    await drag(page, await spotOnPiece(body), await openGroundAt(page));
    await settle(part);
    await settle(body);
    await drag(page, await spotOnPiece(part), await centreOf(pedestal(body)));
    await settle(part);

    await chooseFrom(page, part, 'キャラクターB の部位にする');
    await expect(part).toHaveCount(0, { timeout: 5000 });
    const row = body.locator('[data-body-part]');
    await expect(row).toContainText('キャラクターA');

    await row.click();
    await expect(row).toHaveClass(/ring-2/);

    await chooseFrom(page, row, '部位の見た目を編集');
    const editor = page.getByTestId('part-look-editor');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.getByTestId('part-look-lay').click();
    await expect(editor.getByTestId('part-look-layer')).toHaveCount(1);
    await editor.getByTestId('part-look-mode-paint').click();
    await expect(editor.getByTestId('part-look-paint-layer')).toBeVisible();
    await closePanels(page);

    await settle(body);
    const from = await centreOf(pedestal(body));
    const cell = (await pedestal(body).boundingBox())!.width;
    await drag(page, await spotOnPiece(body), { x: from.x - cell * 2, y: from.y });
    await settle(body);
    const moved = await centreOf(pedestal(body));
    expect(moved.x).toBeLessThan(from.x - cell);

    await chooseFrom(page, row, 'キャラクターB の部位から外す');
    await expect(part).toHaveCount(1, { timeout: 5000 });
    await expect(body.locator('[data-body-part]')).toHaveCount(0);
    await settle(part);
    const partAt = await centreOf(pedestal(part));
    expect(Math.abs(partAt.x - moved.x)).toBeLessThan(cell / 2);
  });
});
