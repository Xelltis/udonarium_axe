import { expect, Page, test } from '@playwright/test';

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
import { centreOf, pedestal, piece, settle } from './see-through-helpers';

/** Chooses an entry of the menu a right-click opens, and leaves the pointer off the table. */
async function chooseFrom(page: Page, rightClick: () => Promise<void>, entry: string) {
  await rightClick();
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
    await dragAndLeave(page, await spotOnPiece(body), await openGroundAt(page));
    await settle(part);
    await settle(body);
    await dragAndLeave(page, await spotOnPiece(part), await centreOf(pedestal(body)));
    await settle(part);

    await chooseFrom(page, () => rightClickPiece(part), 'キャラクターB の部位にする');
    await expect(part).toHaveCount(0, { timeout: 5000 });
    const row = body.locator('[data-body-part]');
    await expect(row).toContainText('キャラクターA');

    await row.click();
    await expect(row).toHaveClass(/ring-2/);

    await chooseFrom(page, () => row.click({ button: 'right' }), '部位の見た目を編集');
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
    await dragAndLeave(page, await spotOnPiece(body), { x: from.x - cell * 2, y: from.y });
    await settle(body);
    const moved = await centreOf(pedestal(body));
    expect(moved.x).toBeLessThan(from.x - cell);

    await chooseFrom(page, () => row.click({ button: 'right' }), 'キャラクターB の部位から外す');
    await expect(part).toHaveCount(1, { timeout: 5000 });
    await expect(body.locator('[data-body-part]')).toHaveCount(0);
    await settle(part);
    const partAt = await centreOf(pedestal(part));
    expect(Math.abs(partAt.x - moved.x)).toBeLessThan(cell / 2);
  });

  test('reads the detail of a part from its row under the body, and has the row draw its buffs as the body is set to', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);

    const part = piece(page, 'キャラクターA');
    const body = piece(page, 'キャラクターB');
    await settle(body);
    await dragAndLeave(page, await spotOnPiece(body), await openGroundAt(page));
    await settle(part);
    await settle(body);

    await rightClickPiece(part);
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, menu, 'バフ編集')).click();
    const buffView = page.locator('game-character-buff-view');
    await expect(buffView).toBeVisible({ timeout: 5000 });
    await buffView.getByRole('button', { name: /バフを追加/ }).click();
    await expect(buffView.locator('[game-data-element-buff]').first()).toBeVisible({ timeout: 5000 });
    await closePanels(page);

    await dragAndLeave(page, await spotOnPiece(part), await centreOf(pedestal(body)));
    await settle(part);
    await chooseFrom(page, () => rightClickPiece(part), 'キャラクターB の部位にする');
    await expect(part).toHaveCount(0, { timeout: 5000 });
    const row = body.locator('[data-body-part]');
    await expect(row).toContainText('キャラクターA');
    await settle(body);

    const detail = page.locator('overview-panel');
    await row.getByTestId('riding-label-name').hover();
    await expect(detail).toContainText('キャラクターA', { timeout: 5000 });
    await expect(detail).not.toContainText('キャラクターB');
    await page.mouse.move(5, 400);
    await expect(detail).toHaveCount(0, { timeout: 5000 });

    await row.click();
    await expect(row).toHaveClass(/ring-2/);
    await page.mouse.move(5, 400);
    await expect(detail).toHaveCount(0, { timeout: 5000 });

    const buffs = row.getByTestId('riding-label-buffs');
    const icons = buffs.getByTestId('buff-badge-grid').getByTestId('buff-badge');
    await expect(icons.first()).toBeVisible({ timeout: 5000 });
    const count = await icons.count();
    const chooseBuffView = async (label: string) => {
      await rightClickPiece(body);
      await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
      await (await revealMenuEntry(page, menu, 'バフの表示')).hover();
      const item = menu.getByText(new RegExp(`^(✔ )?${label}$`));
      await expect(item).toBeVisible({ timeout: 5000 });
      await item.click();
      await expect(menu).toHaveCount(0, { timeout: 5000 });
      await page.mouse.move(5, 400);
    };

    await chooseBuffView('詳細');
    await expect(buffs.getByTestId('buff-badge-grid')).toHaveCount(0, { timeout: 5000 });
    await expect(buffs.locator('[game-data-element-buff]').first()).toBeVisible({ timeout: 5000 });
    await expect(row).toContainText('キャラクターA');

    await chooseBuffView('個数');
    await expect(buffs).toHaveText(new RegExp(`バフ${count}個`), { timeout: 5000 });
    await expect(row).toContainText('キャラクターA');

    const card = await body.getByTestId('riding-label').boundingBox();
    const screen = page.viewportSize()!;
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.y).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(screen.width);
    expect(card!.y + card!.height).toBeLessThanOrEqual(screen.height);
  });
});
