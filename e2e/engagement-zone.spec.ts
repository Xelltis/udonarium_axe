import { expect, Page, test } from '@playwright/test';

import { openPanel, revealMenuEntry, waitAppReady } from './helpers';
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

/** Opens a piece's menu and chooses an entry, through the submenu named first where one is given. */
async function choose(page: Page, name: string, entry: string | RegExp, submenu?: string) {
  await piece(page, name).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  if (submenu) await menu.getByText(submenu, { exact: true }).hover();
  await menu.getByText(entry).click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

/** Whether a piece's menu offers an entry of that name at its top level. */
async function menuOffers(page: Page, name: string, entry: string): Promise<boolean> {
  await piece(page, name).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  const offered = (await menu.getByText(entry, { exact: true }).count()) > 0;
  await page.mouse.click(5, 400);
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
  return offered;
}

test.describe('交戦エリア', () => {
  test('部屋設定でオンにし、同じ点の敵と交戦を宣言すると円が出て、予告するまで動けず、敵が外れると消えること', async ({
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
    await foe.dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await revealMenuEntry(page, menu, 'NPC にする');
    const npc = menu.locator('li', { hasText: 'NPC にする' });
    await expect(npc).toBeVisible({ timeout: 5000 });
    if (await npc.locator('input[type="checkbox"]').isChecked()) await page.mouse.click(5, 400);
    else await npc.click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });

    await settle(hero);
    await drag(page, await centreOf(pedestal(hero)), await centreOf(pedestal(foe)));
    await settle(hero);

    await choose(page, 'キャラクターA', 'モンスターA と交戦する', '交戦エリア');

    const zones = page.getByTestId('zone-mark');
    await expect(zones).toHaveCount(1, { timeout: 5000 });
    await expect(zones.first().locator('text')).toHaveText('2/20');

    expect(await menuOffers(page, 'キャラクターA', '移動')).toBe(false);
    await choose(page, 'キャラクターA', '次の手番で離れると予告する', '交戦エリア');
    expect(await menuOffers(page, 'キャラクターA', '移動')).toBe(true);

    await choose(page, 'モンスターA', '交戦エリアから外れる', '交戦エリア');

    await expect(zones).toHaveCount(0, { timeout: 5000 });
  });
});
