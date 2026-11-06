import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * The pieces on a table of a village or a fort just generated, among its walls, buildings, fields and
 * things drawn as models, which may be taken up and moved on again and again from wherever they were
 * put, as on any other table.
 */

type Hooks = {
  whenIdle(): Promise<void>;
  moving(identifier: string): boolean;
  pressedAt(x: number, y: number): string | null;
};

async function generateSettlement(page: Page, mood: string) {
  await openPanel(page, 'マップ生成');
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: 'フィールド', exact: true }).click();
  await panel.getByRole('button', { name: mood, exact: true }).click();
  await panel.locator('#seed').fill('20261106');
  await panel.getByRole('button', { name: '生成する' }).click();
  await panel.getByRole('button', { name: 'このテーブルへ移動' }).click({ timeout: 120000 });
  const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
  if (await later.count()) await later.first().dispatchEvent('click');
  await closePanels(page);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/**
 * A point of a piece's base a press takes it by, on the table where nothing laid over the table covers
 * it, as a panel or a control does.
 */
function spotOf(page: Page, identifier: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate((id) => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const base = document.querySelector(`game-character[data-object-id="${id}"] [data-part="pedestal"]`);
    if (!base) return null;
    const box = base.getBoundingClientRect();
    if (box.top < 70 || box.left < 120 || box.bottom > innerHeight - 160 || box.right > innerWidth - 160) return null;
    for (let y = box.top + 2; y < box.bottom; y += 3) {
      for (let x = box.left + 2; x < box.right; x += 3) {
        const top = document.elementFromPoint(x, y);
        const control = top?.closest('button, input, .rotate-grab');
        if (!control && top?.closest('game-table') && hooks.pressedAt(x, y) === id) return { x, y };
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

test.describe('pieces on a village or a fort just generated, on a table drawn on a canvas', () => {
  for (const { mood, name } of [
    { mood: '農村', name: 'village' },
    { mood: '蛮族の砦', name: 'barbarian fort' },
    { mood: '石造りの砦', name: 'stone fort' },
  ]) {
    test(`are moved on again and again in a ${name}`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name === 'chromium-webgpu',
        'What a press lands on and where a piece goes are worked out the same whatever draws the table, ' +
          'which the WebGL2 project sees; SwiftShader draws a frame of a settlement through WebGPU in ' +
          'seconds beside the rest of the suite, and every move of a drag draws one'
      );
      test.setTimeout(240000);
      await waitAppReady(page);
      await becomeGm(page);
      await closePanels(page);
      await generateSettlement(page, mood);
      const ids = await page
        .locator('game-character')
        .evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('data-object-id')!));
      const viewport = page.viewportSize()!;
      let chosen: string | null = null;
      let nearest = Infinity;
      for (const id of ids) {
        const spot = await spotOf(page, id);
        if (!spot) continue;
        const off = Math.hypot(spot.x - viewport.width / 2, spot.y - viewport.height / 2);
        if (off < nearest) {
          nearest = off;
          chosen = id;
        }
      }
      expect(chosen, 'a piece on the screen to take up').not.toBeNull();

      for (const by of [
        { x: 160, y: 90 },
        { x: -140, y: 70 },
        { x: 110, y: -80 },
      ]) {
        await settled(page, chosen!);
        const from = await spotOf(page, chosen!);
        expect(from, `the piece is still taken up, from ${await placeOf(page, chosen!)}`).not.toBeNull();
        const was = await placeOf(page, chosen!);
        await dragTo(page, from!, { x: from!.x + by.x, y: from!.y + by.y });
        await expect.poll(() => placeOf(page, chosen!)).not.toBe(was);
      }
    });
  }
});
