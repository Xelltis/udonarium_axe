import { expect, Locator, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function createCardStack(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
}

async function drawOne(page: Page) {
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('１枚引く').click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

async function openCardMenu(page: Page) {
  await page.locator('card').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
type ArrowHooks = {
  whenIdle(): Promise<void>;
  project(x: number, y: number, z: number): Point | null;
  pieceBoxesOnPage(identifier: string): Box[];
};

/** Whether a box on the page holds a point. */
function holds(box: Box, point: Point): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

/**
 * Where the two ends of the arrow to a target lie on the page, once what the screen lays over the
 * table stands where the table puts it, with the pointer off the table: where it leaves and where it
 * points to.
 */
async function arrowEndsOnPage(page: Page): Promise<Point[]> {
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: ArrowHooks }).__axeTable.whenIdle());
  const ends = await page.getByTestId('target-arrow').evaluate((element) => {
    const read = (name: string) => Number((element as HTMLElement).dataset[name]);
    return [
      { x: read('fromX'), y: read('fromY') },
      { x: read('toX'), y: read('toY') },
    ];
  });
  return page.evaluate(
    (points) =>
      points.map((point) => (window as unknown as { __axeTable: ArrowHooks }).__axeTable.project(point.x, point.y, 0)!),
    ends
  );
}

/** The box on the page round where the table puts a piece. */
async function boxOnPage(page: Page, piece: Locator): Promise<Box> {
  const identifier = (await piece.getAttribute('data-object-id'))!;
  const [box] = await page.evaluate(
    (id) => (window as unknown as { __axeTable: ArrowHooks }).__axeTable.pieceBoxesOnPage(id),
    identifier
  );
  return box;
}

test.describe('card handling for trading card games', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui-lang', 'ja'));
    await waitAppReady(page);
  });

  test('draws an arrow on the table from the card to the target set, and removes it when the target is cleared', async ({
    page,
  }) => {
    await createCardStack(page);
    await drawOne(page);
    const menu = await openCardMenu(page);
    await menu.getByText('ターゲットを指定').click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText('ターゲットにする対象をクリックしてください')).toBeVisible();

    await page.locator('card-stack').first().dispatchEvent('mousedown');
    await page.locator('card-stack').first().dispatchEvent('mouseup');
    await expect(page.getByTestId('target-arrow')).toHaveCount(1, { timeout: 5000 });
    const [from, to] = await arrowEndsOnPage(page);
    const card = await boxOnPage(page, page.locator('card').first());
    const deck = await boxOnPage(page, page.locator('card-stack').first());
    expect(holds(card, from), JSON.stringify({ from, card })).toBe(true);
    expect(holds(deck, to), JSON.stringify({ to, deck })).toBe(true);

    const cardMenu = await openCardMenu(page);
    await cardMenu.getByText('ターゲットを解除').click();
    await expect(page.getByTestId('target-arrow')).toHaveCount(0, { timeout: 5000 });
  });
});
