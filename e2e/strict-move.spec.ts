import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

/** Turns on the room's strict movement, which is what makes an ordinary press open a move. */
async function askForStrictMoves(page: Page) {
  await openPanel(page, '部屋設定');
  const panel = page.locator('room-settings-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await panel.locator('[data-testid="room-settings-tab-move"]').click();
  const strict = panel.locator('input[name="moveStrict"]');
  await expect(strict).toBeVisible({ timeout: 5000 });
  if (!(await strict.isChecked())) await strict.check();
  await expect(strict).toBeChecked();
}

/** Closes every panel, so nothing lies over the band at the foot of the screen. */
async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await expect(panels).toHaveCount(0);
}

/** Opens the move the piece's own menu offers, which is the one a press opens under strict play. */
async function openMove(page: Page) {
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('移動', { exact: true }).click();
}

test.describe('厳密な移動', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await askForStrictMoves(page);
  });

  test('移動を開くと操作ガイドと移動範囲が出ること', async ({ page }) => {
    await openMove(page);

    await expect(page.locator('[data-testid="move-plan-hint"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('table-move-range-overlay canvas')).toHaveCount(1, { timeout: 5000 });

    await page.keyboard.press('Escape');
  });

  test('操作ガイドが上端に固定された道具立てに隠れないこと', async ({ page }) => {
    await openMove(page);

    const hint = page.locator('[data-testid="move-plan-hint"]');
    await expect(hint).toBeVisible({ timeout: 5000 });
    const hintBox = (await hint.boundingBox())!;
    const viewport = page.viewportSize()!;

    // Toolbars are pinned to the top of the screen and can be dragged along it, so a band
    // written up there is read by nobody.
    expect(hintBox.y).toBeGreaterThan(viewport.height / 2);
    expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(viewport.height);

    for (const bar of await page.locator('.fixed.top-0').all()) {
      const barBox = await bar.boundingBox();
      if (!barBox) continue;
      const overlaps =
        hintBox.x < barBox.x + barBox.width &&
        barBox.x < hintBox.x + hintBox.width &&
        hintBox.y < barBox.y + barBox.height &&
        barBox.y < hintBox.y + hintBox.height;
      expect(overlaps).toBe(false);
    }

    await page.keyboard.press('Escape');
  });

  test('部屋が移動の種類を決めていれば、帯で選び替えられ、残りの距離が出ること', async ({ page }) => {
    await page.locator('room-settings-panel input[name="moveKinds"]').fill('全力:3:,通常:1:');
    await closePanels(page);
    await openMove(page);

    const kinds = page.getByTestId('move-plan-kind');
    await expect(kinds).toHaveText(['全力', '通常'], { timeout: 5000 });
    await expect(kinds.first()).toHaveAttribute('aria-pressed', 'true');
    const left = page.getByTestId('move-plan-metres-left');
    const metres = async () => Number((await left.textContent())!.match(/[\d.]+/)![0]);
    const full = await metres();
    expect(full).toBeGreaterThan(0);

    await kinds.nth(1).click();

    await expect(kinds.nth(1)).toHaveAttribute('aria-pressed', 'true');
    expect(await metres()).toBe(full / 3);

    await page.keyboard.press('Escape');
  });

  test('移動をやめると操作ガイドも移動範囲も消えること', async ({ page }) => {
    await openMove(page);
    await expect(page.locator('[data-testid="move-plan-hint"]')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(page.locator('[data-testid="move-plan-hint"]')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('table-move-range-overlay canvas')).toHaveCount(0, { timeout: 5000 });
  });
});
