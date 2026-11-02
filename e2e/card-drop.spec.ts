import { expect, Locator, Page, test } from '@playwright/test';

import { closePanels } from './dungeon-helpers';
import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

/**
 * A card or a deck let go of over a deck goes into it. The deck it lands on is worked out from
 * where the pieces lie on the table rather than from the page, so here they are dragged there with
 * the pointer and what is left on the table is counted.
 */

type Point = { x: number; y: number };

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** The middle of where a piece is drawn: its host has no box of its own, the part that moves has. */
async function middleOf(piece: Locator): Promise<Point> {
  const box = (await piece.locator('[data-location]').first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Points of the table's layer, as offsets into it, where nothing is drawn around them, and to the
 * lower right where a card is to be drawn, far enough apart that two decks made there do not merge.
 */
async function bareSpots(page: Page, count: number, cardDrawn = false): Promise<Point[]> {
  const layer = (await page.locator('#app-table-layer').boundingBox())!;
  const spots = await page.evaluate(
    ({ left, top, count, cardDrawn }) => {
      const hooks = (
        window as unknown as {
          __axeTable: { drawnAt(x: number, y: number): string | null; pickAt(x: number, y: number): string | null };
        }
      ).__axeTable;
      const found: { x: number; y: number }[] = [];
      for (let y = 200; y < innerHeight - 200 && found.length < count; y += 40) {
        for (let x = 300; x < innerWidth - 300 && found.length < count; x += 40) {
          const table = document.querySelector('#app-table-layer')!;
          // A card drawn from a deck is laid down and to the right of it, so that ground is clear too.
          const across = cardDrawn ? [-60, 0, 60, 120, 180, 240] : [-60, 0, 60];
          const down = cardDrawn ? [-60, 0, 60, 120] : [-60, 0, 60];
          const clear = across.every((dx) =>
            down.every((dy) => {
              const at = { x: left + x + dx, y: top + y + dy };
              const front = document.elementFromPoint(at.x, at.y);
              // Clear of what the page draws, and of what a canvas draws, which the page lays over it.
              return (
                !!front &&
                table.contains(front) &&
                hooks.drawnAt(at.x, at.y) === null &&
                hooks.pickAt(at.x, at.y) === null
              );
            })
          );
          if (clear && found.every((spot) => Math.hypot(spot.x - x, spot.y - y) > 250)) found.push({ x, y });
        }
      }
      return found;
    },
    { left: layer.x, top: layer.y, count, cardDrawn }
  );
  expect(spots).toHaveLength(count);
  return spots;
}

/** Waits for a piece to stop gliding, as a card drawn does from the deck to where it is laid. */
async function settle(piece: Locator) {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await piece.locator('[data-location]').first().boundingBox());
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [200] }
    )
    .toBe(true);
}

async function makeDeck(page: Page, at: Point) {
  const before = await page.locator('card-stack').count();
  const menu = await openTableContextMenu(page, at);
  await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack')).toHaveCount(before + 1, { timeout: 10000 });
  // The new deck is made under the pointer, and the overview it opens there would cover the next
  // place reached for.
  await page.mouse.move(5, 400);
  await expect(page.locator('overview-panel')).toHaveCount(0, { timeout: 5000 });
}

test.describe('letting go of cards over a deck', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('takes a card dropped on a deck back into it', async ({ page }) => {
    const [spot] = await bareSpots(page, 1, true);
    await makeDeck(page, spot);
    const deck = page.locator('card-stack').first();
    await deck.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('１枚引く').click();
    const card = page.locator('card');
    await expect(card).toHaveCount(1, { timeout: 5000 });
    await page.mouse.move(5, 400);

    // A card drawn is laid two cells or more off the deck, further than a deck reaches by itself.
    await settle(card);
    await drag(page, await middleOf(card), await middleOf(deck));

    await expect(card).toHaveCount(0, { timeout: 5000 });
  });

  test('merges a deck dropped on another into one', async ({ page }) => {
    const [first, second] = await bareSpots(page, 2);
    await makeDeck(page, first);
    await makeDeck(page, second);
    const decks = page.locator('card-stack');

    await drag(page, await middleOf(decks.nth(1)), await middleOf(decks.nth(0)));

    await expect(decks).toHaveCount(1, { timeout: 5000 });
  });
});
