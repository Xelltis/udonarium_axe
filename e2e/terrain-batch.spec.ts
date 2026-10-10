import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * The walls of a generated dungeon are locked, so they are drawn together rather than as a box
 * each. These check that what a player does to a wall, or to a door between walls, still reaches it.
 */

async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

async function typeInto(input: Locator, text: string) {
  await input.click();
  await input.press('Control+a');
  await input.pressSequentially(text);
}

/** Builds a small dungeon from a fixed seed on the grid named, and goes to its table. */
async function buildDungeon(page: Page, gridLabel: string) {
  await openPanel(page, 'マップ生成');
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: gridLabel, exact: true }).click();
  await typeInto(panel.locator('input[name="room-count-number"]'), '3');
  await typeInto(panel.locator('#seed'), '1278372739');
  await panel.getByRole('button', { name: '生成する' }).click();
  await panel.getByRole('button', { name: 'このテーブルへ移動' }).click({ timeout: 120000 });
  await expect(page.locator('terrain-batch-layer [data-terrain]').first()).toBeAttached({ timeout: 20000 });
  const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
  if (await later.count()) await later.first().dispatchEvent('click');
  await closePanels(page);
}

async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
}

test.describe('まとめて描いた地形', () => {
  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGm(page);
  });

  test('まとめて描いた壁を右クリックすると、その壁の地形メニューが出ること', async ({ page }) => {
    await buildDungeon(page, '四角');

    await page.locator('terrain-batch-layer div[data-terrain]').first().dispatchEvent('contextmenu');

    const menu = page.locator('context-menu');
    await expect(menu.getByText('地形設定を編集')).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('固定解除')).toBeVisible();
  });

  test('Ctrl を押して壁を選ぶと、その壁だけ一つの箱として描き直されること', async ({ page }) => {
    await buildDungeon(page, 'ヘクス（縦）');
    const drawnAlone = await page.locator('terrain').count();
    const wall = page.locator('terrain-batch-layer div[data-terrain]').first();
    const identifier = await wall.getAttribute('data-terrain');

    await wall.dispatchEvent('pointerdown', { button: 0, ctrlKey: true, bubbles: true });

    await expect(page.locator('terrain')).toHaveCount(drawnAlone + 1, { timeout: 5000 });
    await expect(page.locator(`terrain-batch-layer [data-terrain="${identifier}"]`)).toHaveCount(0);
  });

  for (const grid of ['四角', 'ヘクス（縦）', 'ヘクス（横）']) {
    test(`${grid}の迷宮で、扉の上面の真ん中を押すと扉が開くこと`, async ({ page }) => {
      await buildDungeon(page, grid);

      const doors = await page.evaluate(() => {
        const found = [...document.querySelectorAll('terrain')].filter((terrain) =>
          terrain.querySelector('.cursor-pointer')
        );
        const swallowed: string[] = [];
        let opened: { x: number; y: number; index: number } | null = null;
        found.forEach((door, index) => {
          const top = door.querySelector<HTMLElement>('[data-testid="terrain-top"]');
          const rect = top?.getBoundingClientRect();
          if (!rect || rect.width < 4 || rect.height < 4) return;
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          if (x < 80 || y < 70 || x > window.innerWidth - 10 || y > window.innerHeight - 10) return;
          const under = document.elementFromPoint(x, y);
          if (under?.closest('terrain-batch-layer')) swallowed.push(`${Math.round(x)},${Math.round(y)}`);
          else if (under && door.contains(under)) opened ??= { x, y, index };
        });
        return { swallowed, opened };
      });
      // The blocks drawn together round a door take no press meant for the door.
      expect(doors.swallowed).toEqual([]);
      const opened = doors.opened;
      expect(opened).not.toBeNull();

      const door = page
        .locator('terrain')
        .filter({ has: page.locator('.cursor-pointer') })
        .nth(opened!.index);
      const face = door.locator('.z-1').first();
      const before = await face.evaluate((el) => (el as HTMLElement).style.transform);
      await page.mouse.click(opened!.x, opened!.y);

      await expect
        .poll(() => face.evaluate((el) => (el as HTMLElement).style.transform), { timeout: 5000 })
        .not.toBe(before);
    });
  }
});
