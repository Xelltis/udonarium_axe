import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { revealMenuEntry, waitAppReady } from '../helpers';

/**
 * The table's camera following a piece from behind on a table drawn on a canvas: chosen from the
 * piece's menu, moving after the piece as the keys walk it, turned round it by a drag, and given
 * back as it was once the following stops.
 */

type Hooks = { renderer(): string | null; whenIdle(): Promise<void> };

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

function camera(page: Page): Promise<string | null> {
  return page.locator('[data-camera]').getAttribute('data-camera');
}

test.describe('following a piece from behind on a table drawn on a canvas', () => {
  test('moves the camera after the piece walked by the keys, turns it round by a drag, and gives the table its camera back', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
    const onTable = await camera(page);
    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();

    await piece.dispatchEvent('contextmenu');
    await (await revealMenuEntry(page, page.locator('context-menu'), 'このコマを後ろから追う')).click();
    await expect(page.getByTestId('third-person-hud')).toContainText('キャラクターB');
    await expect.poll(() => camera(page)).not.toBe(onTable);
    await idle(page);
    const behind = await camera(page);
    const place = piece.locator('[data-location]').first();
    const standing = await place.getAttribute('data-location');

    await page.keyboard.press('w');
    await expect.poll(() => place.getAttribute('data-location')).not.toBe(standing);
    await expect.poll(() => camera(page)).not.toBe(behind);
    await idle(page);
    const walked = await camera(page);

    await page.mouse.move(640, 650);
    await page.mouse.down();
    await page.mouse.move(760, 650, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => camera(page)).not.toBe(walked);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('third-person-hud')).toHaveCount(0);
    await expect.poll(() => camera(page)).toBe(onTable);
  });
});
