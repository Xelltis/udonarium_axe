import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * The pieces on a table of open country just generated, among its trees and on its high ground,
 * which a press has to reach through the trees locked in front of them, as the page let it reach
 * through a locked block, and which may be stood on the high ground and moved on from there.
 */

type Hooks = {
  whenIdle(): Promise<void>;
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

/** A point of a piece's base a press takes it by, and whether a block stands in front of it there. */
function spotOf(page: Page, identifier: string): Promise<{ x: number; y: number; behind: boolean } | null> {
  return page.evaluate((id) => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const base = document.querySelector(`game-character[data-object-id="${id}"] [data-part="pedestal"]`);
    if (!base) return null;
    const box = base.getBoundingClientRect();
    if (box.top < 70 || box.left < 120) return null;
    for (let y = box.top + 2; y < box.bottom; y += 3) {
      for (let x = box.left + 2; x < box.right; x += 3) {
        if (hooks.pressedAt(x, y) === id) return { x, y, behind: hooks.pickAt(x, y) !== id };
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

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test.describe('pieces on a field just generated, on a table drawn on a canvas', () => {
  test('are taken up through the trees locked in front of them, stood on the high ground and moved on from there', async ({
    page,
  }) => {
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

    let raised = false;
    for (const to of [
      { x: 700, y: 700 },
      { x: 900, y: 600 },
      { x: 1000, y: 700 },
      { x: 600, y: 650 },
    ]) {
      const from = await spotOf(page, hidden!.id);
      expect(from, `the piece is still taken up, from ${await placeOf(page, hidden!.id)}`).not.toBeNull();
      const was = await placeOf(page, hidden!.id);
      await dragTo(page, from!, to);
      await expect.poll(() => placeOf(page, hidden!.id)).not.toBe(was);
      if (Number((await placeOf(page, hidden!.id))!.split(',')[2]) > 0) raised = true;
    }
    expect(raised, 'the piece stood on the high ground once').toBe(true);
  });
});
