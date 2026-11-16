import { expect, Page, test } from '@playwright/test';

import {
  becomeGm,
  closePanels,
  dragAndLeave,
  openGroundAt,
  openPanel,
  revealMenuEntry,
  rightClickPiece,
  spotOnPiece,
  waitAppReady,
} from './helpers';
import { centreOf, pedestal, piece, settle } from './see-through-helpers';

/** Opens a piece's menu and chooses an entry, through the submenu named first where one is given. */
async function choose(page: Page, name: string, entry: string | RegExp, submenu?: string) {
  await rightClickPiece(piece(page, name));
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  if (submenu) await menu.getByText(submenu, { exact: true }).hover();
  await menu.getByText(entry).click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

/** Whether a piece's menu offers an entry of that name at its top level. */
async function menuOffers(page: Page, name: string, entry: string): Promise<boolean> {
  await rightClickPiece(piece(page, name));
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  const offered = (await menu.getByText(entry, { exact: true }).count()) > 0;
  await page.mouse.click(5, 400);
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
  return offered;
}

test.describe('engagement zones', () => {
  test('once turned on in the room settings, draws a circle when engagement is declared with a foe on the same point, holds the piece until it announces leaving, and removes the circle when the foe leaves', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, '部屋設定');
    await page.getByTestId('room-settings-tab-move').click();
    await page.getByTestId('room-settings-zone').getByLabel('交戦エリアを使う').check();
    await closePanels(page);

    const hero = piece(page, 'キャラクターA');
    const foe = piece(page, 'モンスターA');
    await rightClickPiece(foe);
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await revealMenuEntry(page, menu, 'NPC にする');
    const npc = menu.locator('li', { hasText: 'NPC にする' });
    await expect(npc).toBeVisible({ timeout: 5000 });
    if (await npc.locator('input[type="checkbox"]').isChecked()) await page.mouse.click(5, 400);
    else await npc.click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });

    await settle(foe);
    await dragAndLeave(page, await spotOnPiece(foe), await openGroundAt(page));
    await settle(foe);
    await settle(hero);
    await dragAndLeave(page, await spotOnPiece(hero), await centreOf(pedestal(foe)));
    await settle(hero);

    await choose(page, 'キャラクターA', 'モンスターA と交戦する', '交戦エリア');

    const zones = page.getByTestId('zone-mark');
    await expect(zones).toHaveCount(1, { timeout: 5000 });
    await expect(zones.first()).toHaveText('2/20');

    expect(await menuOffers(page, 'キャラクターA', '移動')).toBe(false);
    await choose(page, 'キャラクターA', '次の手番で離れると予告する', '交戦エリア');
    expect(await menuOffers(page, 'キャラクターA', '移動')).toBe(true);

    await choose(page, 'モンスターA', '交戦エリアから外れる', '交戦エリア');

    await expect(zones).toHaveCount(0, { timeout: 5000 });
  });
});
