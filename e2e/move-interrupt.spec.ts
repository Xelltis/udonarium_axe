import { expect, Page, test } from '@playwright/test';

import { openPanel, putAwayTutorial, revealMenuEntry, spotOnPiece, waitAppReady } from './helpers';
import { centreOf, pedestal, piece, Point, settle } from './see-through-helpers';

/**
 * A point of the page about three quarters of the way from one point to another, which is inside the
 * zone round the second whatever the table's tilt, where nothing is drawn: a large piece standing
 * behind, drawn over the floor there, would take the press as its own.
 */
async function bareOnTheWay(page: Page, from: Point, to: Point): Promise<Point> {
  const found = await page.evaluate(
    ({ from, to }) => {
      const hooks = (window as unknown as { __axeTable: { pickAt(x: number, y: number): string | null } }).__axeTable;
      const layer = document.querySelector('#app-table-layer')!;
      for (const share of [0.75, 0.7, 0.8, 0.65, 0.85]) {
        const at = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
        const bare = [-8, 0, 8].every((dx) =>
          [-8, 0, 8].every((dy) => {
            const front = document.elementFromPoint(at.x + dx, at.y + dy);
            return !!front && layer.contains(front) && hooks.pickAt(at.x + dx, at.y + dy) === null;
          })
        );
        if (bare) return at;
      }
      return null;
    },
    { from, to }
  );
  expect(found, 'a bare point on the way into the zone').not.toBeNull();
  return found!;
}

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

/** Where the page draws a point of the table given in cells, on the floor. */
async function onTable(page: Page, x: number, y: number): Promise<Point> {
  return page.evaluate(
    ([cellsX, cellsY]) => {
      const table = (window as unknown as { __axeTable: { project(x: number, y: number, z: number): Point } })
        .__axeTable;
      return table.project(cellsX * 50, cellsY * 50, 0);
    },
    [x, y]
  );
}

/**
 * Where the page draws the middle of a cell of the open ground east of the sample room's pieces, near
 * the back of the table: with room east of it for a move of four cells, and for an enemy put a cell or
 * two off, with none of the other pieces in reach.
 */
function roomyGround(page: Page): Promise<Point> {
  return onTable(page, 20.5, 4.5);
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

test.describe('interrupting a move', () => {
  test('stops where an enemy in reach of the path interrupts, and makes an engagement zone there', async ({ page }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
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
    await drag(page, await spotOnPiece(hero), await roomyGround(page));
    await settle(hero);
    await settle(foe);
    await drag(page, await spotOnPiece(foe), await onTable(page, 22.5, 3.5));
    await settle(foe);

    await hero.dispatchEvent('contextmenu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('移動', { exact: true }).click();
    const target = await onTable(page, 23.7, 4.5);
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

  test('offers an engagement when an enemy is put on an ally, and lets the zone’s side stop a move into the zone and pull it in', async ({
    page,
  }) => {
    await waitAppReady(page);
    await putAwayTutorial(page);
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
    await drag(page, await spotOnPiece(hero), await roomyGround(page));
    await settle(hero);
    const start = await centreOf(pedestal(hero));
    const cell = (await pedestal(hero).boundingBox())!.width;
    await settle(foe);
    await drag(page, await spotOnPiece(foe), { x: start.x + cell * 4, y: start.y });
    await settle(foe);
    const fight = await centreOf(pedestal(foe));
    await settle(friend);
    await drag(page, await spotOnPiece(friend), await centreOf(pedestal(foe)));

    const snackbar = page.getByTestId('snackbar');
    await expect(snackbar).toContainText('キャラクターB は モンスターB', { timeout: 5000 });
    await snackbar.getByTestId('snackbar-action').click();
    const zones = page.getByTestId('zone-mark');
    await expect(zones).toHaveCount(1, { timeout: 5000 });
    await expect(zones.first()).toHaveText('2/20');

    await hero.dispatchEvent('contextmenu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('移動', { exact: true }).click();
    const target = await bareOnTheWay(page, start, fight);
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
    await expect(zones.first()).toHaveText('3/20', { timeout: 10000 });
  });
});
