import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * The pieces on a table of open country just generated, among its trees and over its raised ground,
 * which a press has to reach through the trees locked in front of them, as the page let it reach
 * through a locked block, and which may be moved on again from wherever they were put.
 */

type Hooks = {
  whenIdle(): Promise<void>;
  moving(identifier: string): boolean;
  pickAt(x: number, y: number): string | null;
  pressedAt(x: number, y: number): string | null;
};

async function generateField(page: Page) {
  await openPanel(page, 'マップ生成');
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: 'フィールド', exact: true }).click();
  await panel.locator('#seed').fill('1278372739');
  await panel.getByRole('button', { name: '生成する' }).click();
  await panel.getByRole('button', { name: 'このテーブルへ移動' }).click({ timeout: 120000 });
  const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
  if (await later.count()) await later.first().dispatchEvent('click');
  await closePanels(page);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/**
 * A point of a piece's base a press takes it by, clear of the controls of whatever is laid over it on
 * the screen, and whether a block stands in front of it there.
 */
function spotOf(page: Page, identifier: string): Promise<{ x: number; y: number; behind: boolean } | null> {
  return page.evaluate((id) => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const base = document.querySelector(`game-character[data-object-id="${id}"] [data-part="pedestal"]`);
    if (!base) return null;
    const box = base.getBoundingClientRect();
    if (box.top < 70 || box.left < 120) return null;
    for (let y = box.top + 2; y < box.bottom; y += 3) {
      for (let x = box.left + 2; x < box.right; x += 3) {
        const control = document.elementFromPoint(x, y)?.closest('button, input, .rotate-grab');
        if (!control && hooks.pressedAt(x, y) === id) return { x, y, behind: hooks.pickAt(x, y) !== id };
      }
    }
    return null;
  }, identifier);
}

function placeOf(page: Page, identifier: string): Promise<string | null> {
  return page
    .locator(`game-character[data-object-id="${identifier}"] [data-location]`)
    .first()
    .getAttribute('data-location');
}

/** Waits for a piece to come to rest where it was put down, its landing played out. */
async function settled(page: Page, identifier: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          document
            .querySelector(`[data-object-id="${id}"]`)!
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length +
          ((window as unknown as { __axeTable: Hooks }).__axeTable.moving(id) ? 1 : 0),
        identifier
      )
    )
    .toBe(0);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/**
 * Drags from one point to another, a moment after whatever was let go of last, so that the press is
 * not taken for the second half of a double click on what was just put down.
 */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.waitForTimeout(600);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test.describe('pieces on a field just generated, on a table drawn on a canvas', () => {
  test('are taken up through the trees locked in front of them, and moved on again and again over the raised ground', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'chromium-webgpu',
      'What a press lands on and where a piece goes are worked out the same whatever draws the table, ' +
        'which the WebGL2 project sees; SwiftShader draws a frame of a field through WebGPU in seconds ' +
        'beside the rest of the suite, and every move of a drag draws one'
    );
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await generateField(page);
    const ids = await page
      .locator('game-character')
      .evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('data-object-id')!));
    let hidden: { id: string; spot: { x: number; y: number } } | null = null;
    for (const id of ids) {
      const spot = await spotOf(page, id);
      if (spot?.behind) {
        hidden = { id, spot };
        break;
      }
    }
    expect(hidden, 'a piece a locked tree stands in front of').not.toBeNull();
    const before = await placeOf(page, hidden!.id);

    await dragTo(page, hidden!.spot, { x: hidden!.spot.x + 120, y: hidden!.spot.y + 60 });
    await expect.poll(() => placeOf(page, hidden!.id)).not.toBe(before);

    for (const by of [
      { x: 140, y: 120 },
      { x: -120, y: 60 },
      { x: 100, y: -70 },
    ]) {
      await settled(page, hidden!.id);
      const from = await spotOf(page, hidden!.id);
      expect(from, `the piece is still taken up, from ${await placeOf(page, hidden!.id)}`).not.toBeNull();
      const was = await placeOf(page, hidden!.id);
      await dragTo(page, from!, { x: from!.x + by.x, y: from!.y + by.y });
      await expect.poll(() => placeOf(page, hidden!.id)).not.toBe(was);
    }
  });
});
