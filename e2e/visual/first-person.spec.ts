import { expect, Page, test } from '@playwright/test';

import {
  becomeGm,
  chooseMenu,
  closeModal,
  closePanels,
  freeze,
  menuEntry,
  openTableSetting,
  prepare,
  rightClickTable,
  settle,
  snap,
} from './fixtures';

async function createAt(page: Page, position: { x: number; y: number }, entry: string, selector: string) {
  const before = await page.locator(selector).count();
  const menu = await rightClickTable(page, position);
  await chooseMenu(page, menu, entry);
  await expect(page.locator(selector)).toHaveCount(before + 1, { timeout: 10000 });
  await settle(page, 400);
}

async function lookOutOf(page: Page, piece: ReturnType<Page['locator']>) {
  await piece.dispatchEvent('contextmenu');
  await settle(page, 400);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await (await menuEntry(page, menu, 'このコマの視点で見る')).dispatchEvent('click');
  await settle(page, 400);
  await expect(page.locator('first-person-view [data-quad="wall"]').first()).toBeAttached({ timeout: 10000 });
  await settle(page, 400);
}

async function standBeforeABlockAndLook(page: Page) {
  await createAt(page, { x: 700, y: 450 }, 'キャラクターを作成', 'game-character');
  const piece = page.locator('game-character').last();
  await createAt(page, { x: 800, y: 380 }, '地形を作成', 'terrain');
  await lookOutOf(page, piece);
}

test('a piece on the square grid looks at a block on the table it stands on', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await standBeforeABlockAndLook(page);
  await snap(page, 'first-person-square');
});

test('a piece on a hex grid looks at a hex block the same way', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await openTableSetting(page);
  await page.locator('modal select[name="tableGridType"]').selectOption('1');
  await settle(page);
  await closeModal(page);
  await standBeforeABlockAndLook(page);
  await snap(page, 'first-person-hex');
});

/**
 * Presses on the view and drags it by the given distance, leaving it held. The press is a pointer of
 * its own rather than the mouse, which the picture is taken with moved out of the way.
 */
async function dragLook(page: Page, dx: number, dy: number) {
  const scene = page.locator('[data-testid="first-person-scene"]');
  const at = (x: number, y: number) => ({
    pointerId: 7,
    isPrimary: true,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  await scene.dispatchEvent('pointerdown', at(640, 400));
  for (let step = 1; step <= 10; step++) {
    await scene.dispatchEvent('pointermove', at(640 + (dx * step) / 10, 400 + (dy * step) / 10));
  }
  await settle(page, 400);
}

/** Lets go of the view, which stays looking where it was dragged, and brings it back ahead with Escape. */
async function letGo(page: Page) {
  await page
    .locator('[data-testid="first-person-scene"]')
    .dispatchEvent('pointerup', { pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0, bubbles: true });
  await page.keyboard.press('Escape');
  await settle(page, 400);
}

test('a piece on the square grid looks up, down and round behind while the view is dragged', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await standBeforeABlockAndLook(page);

  await dragLook(page, 0, -500);
  await snap(page, 'first-person-look-up');
  await letGo(page);

  await dragLook(page, 0, 600);
  await snap(page, 'first-person-look-down');
  await letGo(page);

  await dragLook(page, 2540, 0);
  await snap(page, 'first-person-look-back');
  await letGo(page);
});

test('a piece on a hex grid looks up the same way', async ({ page }) => {
  await prepare(page);
  await becomeGm(page);
  await closePanels(page);
  await freeze(page);
  await openTableSetting(page);
  await page.locator('modal select[name="tableGridType"]').selectOption('1');
  await settle(page);
  await closeModal(page);
  await standBeforeABlockAndLook(page);

  await dragLook(page, 0, -500);
  await snap(page, 'first-person-look-up-hex');
  await letGo(page);
});
