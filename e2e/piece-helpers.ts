import { expect, Page } from '@playwright/test';

import { cellSpot, idle, openTableContextMenu, revealMenuEntry, rightClickPiece } from './helpers';

/**
 * Making pieces of each kind on the table and finding them by the shapes they are picked by, for the
 * specs that hold what the page lays out, or what the canvas draws, against picking.
 */

export type Box = { x: number; y: number; width: number; height: number };

/** The boxes on the page round the shapes a piece is picked by, in the order it is drawn with them. */
export function boxesOf(page: Page, identifier: string): Promise<Box[]> {
  return page.evaluate((id) => window.__axeTable.pieceBoxesOnPage(id), identifier);
}

/**
 * Waits for a piece's animations, such as the bounce it comes onto the table with, to finish: the
 * page's, and the moves the table plays itself.
 */
export async function settled(page: Page, identifier: string) {
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          document
            .querySelector(`[data-object-id="${id}"]`)!
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === 'running').length + (window.__axeTable.moving(id) ? 1 : 0),
        identifier
      )
    )
    .toBe(0);
}

/** The identifiers of the pieces with a tag on the table now. */
export function idsOf(page: Page, tag: string): Promise<string[]> {
  return page.locator(tag).evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('data-object-id')!));
}

/**
 * The identifier of the piece with a tag that has come onto the table since the identifiers given
 * were read: the first table's tutorial lays out pieces of its own, which may come after it.
 */
export async function madeSince(page: Page, tag: string, before: readonly string[]): Promise<string> {
  let made: string | undefined;
  await expect
    .poll(async () => {
      made = (await idsOf(page, tag)).find((id) => !before.includes(id));
      return made;
    })
    .toBeTruthy();
  return made!;
}

/**
 * A point of the bare board south of the sample pieces, as an offset into the table's layer, with
 * room to its right for a card drawn off a deck and for a white board to lie on the screen whole.
 */
export function openBoardAt(page: Page): Promise<{ x: number; y: number }> {
  return cellSpot(page, 13.5, 16.5);
}

/** Makes a deck of playing cards on the open board, and takes the pointer off it. */
export async function createDeck(page: Page) {
  const before = await page.locator('card-stack').count();
  const menu = await openTableContextMenu(page, await openBoardAt(page));
  await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack')).toHaveCount(before + 1, { timeout: 10000 });
  await page.mouse.move(5, 400);
  await expect(page.locator('overview-panel')).toHaveCount(0, { timeout: 5000 });
}

/** Draws a card off the deck made last, which lays it a little way off the deck. */
export async function drawCard(page: Page) {
  const before = await page.locator('card').count();
  await rightClickPiece(page.locator('card-stack').last());
  await page.locator('context-menu').getByText('１枚引く').click();
  await expect(page.locator('card')).toHaveCount(before + 1, { timeout: 5000 });
  await page.mouse.move(5, 400);
}

/** Makes a shared note from the table's menu. */
export async function createNote(page: Page) {
  const before = await page.locator('text-note').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '共有メモを作成')).click();
  await expect(page.locator('text-note')).toHaveCount(before + 1, { timeout: 10000 });
}

/** Makes a map mask from the table's menu. */
export async function createMask(page: Page) {
  const before = await page.locator('game-table-mask').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'マップマスクを作成')).click();
  await expect(page.locator('game-table-mask')).toHaveCount(before + 1, { timeout: 10000 });
}

/** Makes a round range from the table's menu. */
export async function createRange(page: Page) {
  const before = await page.locator('range').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '射程範囲を作成')).hover();
  await expect(menu.getByText('円形', { exact: true })).toBeVisible({ timeout: 5000 });
  await menu.getByText('円形', { exact: true }).click();
  await expect(page.locator('range')).toHaveCount(before + 1, { timeout: 10000 });
}

/** Makes a light from the table's menu. */
export async function createLight(page: Page) {
  const before = await page.locator('light-source').count();
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, '光源を作成')).click();
  await expect(page.locator('light-source')).toHaveCount(before + 1, { timeout: 10000 });
}

/** What making a piece of a kind takes: its tag, how it is made, and how many shapes it is picked by. */
export interface MadePiece {
  tag: string;
  create: (page: Page) => Promise<void>;
  shapes: number;
}

/**
 * Makes a piece and waits until picking finds it and its animations are over, and answers its
 * identifier. `settle` waits for the table to be drawn as it stands, as the table of the spec is drawn.
 */
export async function made(
  page: Page,
  piece: MadePiece,
  settle: (page: Page) => Promise<void> = idle
): Promise<string> {
  const before = await idsOf(page, piece.tag);
  await piece.create(page);
  const id = await madeSince(page, piece.tag, before);
  await settle(page);
  await expect.poll(async () => (await boxesOf(page, id)).length, { timeout: 10000 }).toBe(piece.shapes);
  await settled(page, id);
  await settle(page);
  return id;
}

/** Takes a piece off the table by the entry of its own menu given. */
export async function takeAway(page: Page, tag: string, identifier: string, entry: string) {
  const piece = page.locator(`${tag}[data-object-id="${identifier}"]`);
  await rightClickPiece(piece);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await (await revealMenuEntry(page, menu, entry, true)).click();
  await expect(piece).toHaveCount(0, { timeout: 5000 });
}
