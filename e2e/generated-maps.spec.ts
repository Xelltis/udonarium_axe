import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { openPanel, waitAppReady } from './helpers';

/**
 * The pieces on a table just generated, among its trees, walls, buildings and fields and over its
 * raised ground: a press has to reach a piece through the trees locked in front of it, as the page
 * lets it reach through a locked block, and a piece may be taken up and moved on again and again from
 * wherever it was put, as on any other table. Where a press lands and where a piece goes are worked
 * out by picking, the same whether or not the table is drawn.
 */

type Hooks = {
  whenIdle(): Promise<void>;
  moving(identifier: string): boolean;
  pickAt(x: number, y: number): string | null;
  pressedAt(x: number, y: number): string | null;
};

/** Generates open country, or a settlement of the mood named, from a fixed seed, and goes to its table. */
async function generate(page: Page, seed: string, mood?: string) {
  await openPanel(page, 'マップ生成');
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: 'フィールド', exact: true }).click();
  if (mood) await panel.getByRole('button', { name: mood, exact: true }).click();
  await panel.locator('#seed').fill(seed);
  await panel.getByRole('button', { name: '生成する' }).click();
  await panel.getByRole('button', { name: 'このテーブルへ移動' }).click({ timeout: 120000 });
  const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
  if (await later.count()) await later.first().dispatchEvent('click');
  await closePanels(page);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

/**
 * A point of a piece's base a press takes it by, clear of the controls of whatever is laid over it on
 * the screen and of the bars along the top and the left, and whether a block stands in front of it
 * there: a point behind a block where there is one, or else the first the press takes it by.
 */
function spotBehindOf(page: Page, identifier: string): Promise<{ x: number; y: number; behind: boolean } | null> {
  return page.evaluate((id) => {
    const hooks = (window as unknown as { __axeTable: Hooks }).__axeTable;
    const base = document.querySelector(`game-character[data-object-id="${id}"] [data-part="pedestal"]`);
    if (!base) return null;
    const box = base.getBoundingClientRect();
    let first: { x: number; y: number; behind: boolean } | null = null;
    for (let y = Math.max(box.top + 2, 70); y < box.bottom; y += 3) {
      for (let x = Math.max(box.left + 2, 120); x < box.right; x += 3) {
        const control = document.elementFromPoint(x, y)?.closest('button, input, .rotate-grab');
        if (control || hooks.pressedAt(x, y) !== id) continue;
        if (hooks.pickAt(x, y) !== id) return { x, y, behind: true };
        first ??= { x, y, behind: false };
      }
    }
    return first;
  }, identifier);
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

/** The identifiers of the pieces on the table in view. */
function piecesOnTable(page: Page): Promise<string[]> {
  return page
    .locator('game-character')
    .evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('data-object-id')!));
}

test.describe('pieces on a field just generated', () => {
  test('are taken up through the trees locked in front of them, and moved on again and again over the raised ground', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await generate(page, '1278372739');
    let hidden: { id: string; spot: { x: number; y: number } } | null = null;
    for (const id of await piecesOnTable(page)) {
      const spot = await spotBehindOf(page, id);
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
      const from = await spotBehindOf(page, hidden!.id);
      expect(from, `the piece is still taken up, from ${await placeOf(page, hidden!.id)}`).not.toBeNull();
      const was = await placeOf(page, hidden!.id);
      await page.waitForTimeout(600);
      // What a press there takes just before it is made, told if the piece is not moved by it.
      const pressed = await page.evaluate(
        ([x, y]) => (window as unknown as { __axeTable: Hooks }).__axeTable.pressedAt(x, y),
        [from!.x, from!.y]
      );
      await dragTo(page, from!, { x: from!.x + by.x, y: from!.y + by.y });
      await expect
        .poll(() => placeOf(page, hidden!.id), {
          message: `the piece moved from ${was} by ${by.x},${by.y}; a press at ${from!.x},${from!.y} took ${pressed}`,
        })
        .not.toBe(was);
    }
  });
});

test.describe('pieces on a village or a fort just generated', () => {
  for (const { mood, name } of [
    { mood: '農村', name: 'village' },
    { mood: '蛮族の砦', name: 'barbarian fort' },
    { mood: '石造りの砦', name: 'stone fort' },
  ]) {
    test(`are moved on again and again in a ${name}`, async ({ page }) => {
      test.setTimeout(240000);
      await waitAppReady(page);
      await becomeGm(page);
      await closePanels(page);
      await generate(page, '20261106', mood);
      const viewport = page.viewportSize()!;
      let chosen: string | null = null;
      let nearest = Infinity;
      for (const id of await piecesOnTable(page)) {
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
