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

test.describe('移動の割り込み', () => {
  test('経路に届く敵の側が割り込むと、その地点で止まり、交戦エリアができること', async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, '部屋設定');
    await page.getByTestId('room-settings-tab-move').click();
    const zone = page.getByTestId('room-settings-zone');
    await zone.getByLabel('交戦エリアを使う').check();
    await zone.getByLabel('移動の割り込みを使う').check();
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
    const start = await centreOf(pedestal(hero));
    const cell = (await pedestal(hero).boundingBox())!.width;
    await settle(foe);
    await drag(page, await centreOf(pedestal(foe)), { x: start.x + cell * 2, y: start.y + cell });
    await settle(foe);

    await hero.dispatchEvent('contextmenu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('移動', { exact: true }).click();
    const target = { x: start.x + cell * 3.2, y: start.y };
    await page.mouse.move(target.x, target.y, { steps: 4 });
    await page.mouse.click(target.x, target.y);

    const prompt = page.getByTestId('interrupt-prompt');
    await expect(prompt.getByTestId('interrupt-piece').filter({ hasText: 'モンスターA' })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('interrupt-lit').first()).toBeAttached();
    await prompt.getByTestId('interrupt-step').click();

    await expect(prompt).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByTestId('zone-mark')).toHaveCount(1, { timeout: 10000 });
  });

  test('敵を味方の上に置くと交戦を持ちかけられ、交戦エリアに入る移動はエリアの側が止めて引き込めること', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, '部屋設定');
    await page.getByTestId('room-settings-tab-move').click();
    const settings = page.getByTestId('room-settings-zone');
    await settings.getByLabel('交戦エリアを使う').check();
    await settings.getByLabel('移動の割り込みを使う').check();
    await closePanels(page);

    const hero = piece(page, 'キャラクターA');
    const friend = piece(page, 'キャラクターB');
    const foe = piece(page, 'モンスターB');
    const menu = page.locator('context-menu');
    await foe.dispatchEvent('contextmenu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await revealMenuEntry(page, menu, 'NPC にする');
    const npc = menu.locator('li', { hasText: 'NPC にする' });
    await expect(npc).toBeVisible({ timeout: 5000 });
    if (await npc.locator('input[type="checkbox"]').isChecked()) await page.mouse.click(5, 400);
    else await npc.click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });

    await settle(hero);
    const start = await centreOf(pedestal(hero));
    const cell = (await pedestal(hero).boundingBox())!.width;
    await settle(foe);
    await drag(page, await centreOf(pedestal(foe)), { x: start.x + cell * 4, y: start.y });
    await settle(foe);
    const fight = await centreOf(pedestal(foe));
    await settle(friend);
    await drag(page, await centreOf(pedestal(friend)), await centreOf(pedestal(foe)));

    const snackbar = page.getByTestId('snackbar');
    await expect(snackbar).toContainText('キャラクターB は モンスターB', { timeout: 5000 });
    await snackbar.getByTestId('snackbar-action').click();
    const zones = page.getByTestId('zone-mark');
    await expect(zones).toHaveCount(1, { timeout: 5000 });
    await expect(zones.first().locator('text')).toHaveText('2/20');

    await hero.dispatchEvent('contextmenu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('移動', { exact: true }).click();
    // Three quarters of the way to the zone's centre, which is inside it whatever the table's tilt.
    const target = { x: start.x + (fight.x - start.x) * 0.75, y: start.y + (fight.y - start.y) * 0.75 };
    await page.mouse.move(target.x, target.y, { steps: 4 });
    await page.mouse.click(target.x, target.y);

    const prompt = page.getByTestId('interrupt-prompt');
    const chip = prompt.getByTestId('interrupt-piece').filter({ hasText: 'モンスターB' });
    await expect(chip).toBeVisible({ timeout: 5000 });
    await expect(chip.getByTestId('interrupt-piece-zone')).toBeVisible();
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await prompt.getByTestId('interrupt-step').click();

    await expect(prompt).toHaveCount(0, { timeout: 10000 });
    await expect(zones).toHaveCount(1);
    await expect(zones.first().locator('text')).toHaveText('3/20', { timeout: 10000 });
  });
});
