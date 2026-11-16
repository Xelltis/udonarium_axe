import { expect, Locator, Page, test } from '@playwright/test';

import { createCharacter, idle, openPanel, waitAppReady } from './helpers';
import { idsOf } from './piece-helpers';

/**
 * Holding an effect ready from the list, picking its targets on the table and casting it: nothing of
 * the panel or of the band over the table moves or changes size on the way, and nothing is cast
 * before it is confirmed.
 */

type Box = { x: number; y: number; width: number; height: number };

/** The four regions the panel is laid out in, from the top. */
const REGIONS = ['effect-library-filters', 'effect-library-stance', 'effect-library-list', 'effect-library-notice'];

/** The boxes inside the region an effect is held ready in, whose sizes are fixed too. */
const STANCE_PARTS = [
  'effect-library-preview',
  'effect-library-stance-name',
  'effect-library-stance-caster',
  'effect-library-stance-targets',
  'effect-library-fire',
  'effect-library-cancel',
];

/**
 * The identifiers of as many pieces on the table as asked: the sample room's own first, and new ones
 * made, each once the table has settled from the one before, only where those are too few.
 */
async function piecesOnTable(page: Page, count: number): Promise<string[]> {
  for (let had = (await idsOf(page, 'game-character')).length; had < count; had++) {
    await createCharacter(page);
    await idle(page);
  }
  return (await idsOf(page, 'game-character')).slice(0, count);
}

/** Opens the list of effects. */
async function openEffectLibrary(page: Page): Promise<Locator> {
  await openPanel(page, 'エフェクト');
  const panel = page.locator('effect-library-panel');
  await expect(panel).toBeVisible({ timeout: 5000 });
  return panel;
}

/**
 * Adds an effect of the room's own that takes several targets, up to a limit, and narrows the list to
 * it: the effects that come with the tool are free to change, and this flow should not change with them.
 */
async function addEffect(page: Page, panel: Locator, name: string, limit: number): Promise<Locator> {
  await panel.getByTitle('エフェクトを追加').click();
  const editor = page.locator('effect-preset-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });
  await editor.locator('input[name="effect-name"]').fill(name);
  await editor.locator('select[name="effect-targeting"]').selectOption('multi');
  await editor.locator('input[name="effect-max-targets"]').fill(String(limit));
  await page.locator('ui-panel', { has: editor }).getByTestId('panel-close').dispatchEvent('click');
  await expect(editor).toHaveCount(0);

  await panel.getByPlaceholder(/名前・系統/).fill(name);
  const tile = panel.locator('[data-effect-tile]').filter({ hasText: name }).first();
  await expect(tile).toBeVisible();
  return tile;
}

/**
 * Presses a piece on the table. Sent straight to the element the piece is grabbed by: the pieces made
 * here stand on one cell, where a click at a point would land on the topmost alone.
 */
async function press(page: Page, identifier: string): Promise<void> {
  const grab = page.locator(`game-character[data-object-id="${identifier}"] [appmovable]`).first();
  await grab.dispatchEvent('mousedown', { button: 0, buttons: 1 });
  await grab.dispatchEvent('mouseup', { button: 0, buttons: 0 });
}

/** Where each of the boxes named stands on the page now. */
async function boxesOf(scope: Locator, testIds: readonly string[]): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const testId of testIds) boxes.push((await scope.getByTestId(testId).boundingBox())!);
  return boxes;
}

test.describe('holding an effect ready', () => {
  test('keeps the panel’s regions and the band over the table where they are from nothing chosen to after the cast, and casts only at Enter', async ({
    page,
  }) => {
    await waitAppReady(page);
    const [first, second, third] = await piecesOnTable(page, 3);
    const panel = await openEffectLibrary(page);
    const tile = await addEffect(page, panel, '受け入れの二連', 2);
    const stance = panel.getByTestId('effect-library-stance');
    const count = panel.getByTestId('effect-library-stance-count');
    const notice = panel.getByTestId('effect-library-notice');
    const band = page.getByTestId('target-band');

    // Nothing chosen: no band, no preview made yet.
    await expect(stance).toHaveAttribute('data-stance', 'idle');
    await expect(band).toHaveCount(0);
    const regions = await boxesOf(panel, REGIONS);
    const parts = await boxesOf(panel, STANCE_PARTS);
    expect(await panel.locator('canvas').count()).toBe(0);

    // Held ready with no target: the band comes at once and the one preview is made.
    await tile.click();
    await expect(stance).toHaveAttribute('data-stance', 'aiming');
    await expect(count).toHaveText('0/2');
    await expect(band).toHaveAttribute('data-aiming', 'true');
    await expect(page.getByTestId('target-band-fire')).toBeDisabled();
    await expect(panel.locator('canvas')).toHaveCount(1);
    await expect(panel.getByTestId('effect-library-preview').locator('canvas')).toHaveCount(1);
    expect(await boxesOf(panel, REGIONS)).toEqual(regions);
    expect(await boxesOf(panel, STANCE_PARTS)).toEqual(parts);
    const bandBox = await band.boundingBox();

    // One target: the buttons that cast come into use, and nothing comes, goes or moves.
    await press(page, first);
    await expect(count).toHaveText('1/2');
    await expect(panel.getByTestId('effect-library-fire')).toBeEnabled();
    await expect(page.getByTestId('target-band-fire')).toBeEnabled();
    expect(await boxesOf(panel, REGIONS)).toEqual(regions);
    expect(await boxesOf(panel, STANCE_PARTS)).toEqual(parts);
    expect(await band.boundingBox()).toEqual(bandBox);

    // The limit: nothing is cast by filling it.
    await press(page, second);
    await expect(count).toHaveText('2/2');
    await expect(stance).toHaveAttribute('data-stance', 'aiming');
    await expect(notice).toHaveText('');
    expect(await boxesOf(panel, REGIONS)).toEqual(regions);
    expect(await boxesOf(panel, STANCE_PARTS)).toEqual(parts);
    expect(await band.boundingBox()).toEqual(bandBox);

    // One more than the limit takes the place of the earliest; still nothing is cast.
    await press(page, third);
    await expect(count).toHaveText('2/2');
    await expect(panel.getByTestId('effect-library-target-chip')).toHaveCount(2);
    await expect(stance).toHaveAttribute('data-stance', 'aiming');
    expect(await boxesOf(panel, REGIONS)).toEqual(regions);
    expect(await band.boundingBox()).toEqual(bandBox);
    await expect(panel.locator('canvas')).toHaveCount(1);

    // Enter casts it, once: the effect is no longer held and the line of notices says whom it was cast at.
    await page.keyboard.press('Enter');
    await expect(stance).toHaveAttribute('data-stance', 'idle');
    await expect(notice).toContainText('発動しました');
    await expect(band).not.toHaveAttribute('data-aiming', 'true');
    expect(await boxesOf(panel, REGIONS)).toEqual(regions);
    expect(await boxesOf(panel, STANCE_PARTS)).toEqual(parts);
    await expect(panel.locator('canvas')).toHaveCount(1);
  });

  test('casts and calls off from the band over the table, without the panel being touched', async ({ page }) => {
    await waitAppReady(page);
    const [first, second] = await piecesOnTable(page, 2);
    const panel = await openEffectLibrary(page);
    const tile = await addEffect(page, panel, '受け入れの帯', 2);
    const stance = panel.getByTestId('effect-library-stance');
    const band = page.getByTestId('target-band');

    await tile.click();
    await press(page, first);
    await expect(page.getByTestId('target-band-count')).toHaveText('1/2');
    await page.getByTestId('target-band-cancel').click();
    await expect(stance).toHaveAttribute('data-stance', 'idle');
    await expect(band).toHaveCount(0);
    await expect(panel.getByTestId('effect-library-notice')).toHaveText('');

    // The piece pressed before is still selected, so it is the caster now and another is the target.
    await tile.click();
    await press(page, second);
    await expect(page.getByTestId('target-band-count')).toHaveText('1/2');
    await page.getByTestId('target-band-fire').click();
    await expect(stance).toHaveAttribute('data-stance', 'idle');
    await expect(panel.getByTestId('effect-library-notice')).toContainText('発動しました');
    // The piece cast at stays aimed at, so the band stays as the plain one that lets go of every aim.
    await expect(band).toBeVisible();
    await expect(band).not.toHaveAttribute('data-aiming', 'true');
  });

  test('names every target on one row of a fixed height that scrolls sideways, however many are pressed', async ({
    page,
  }) => {
    await waitAppReady(page);
    // As many names as run past the row of the panel at the size it first opens at.
    const limit = 6;
    const pieces = await piecesOnTable(page, limit + 3);
    const panel = await openEffectLibrary(page);
    const tile = await addEffect(page, panel, '受け入れの六連', limit);
    const row = panel.getByTestId('effect-library-stance-targets');
    const chips = panel.getByTestId('effect-library-target-chips');

    await tile.click();
    const empty = (await row.boundingBox())!;
    const regions = await boxesOf(panel, REGIONS);

    for (const [index, piece] of pieces.entries()) {
      await press(page, piece);
      await expect(panel.getByTestId('effect-library-target-chip')).toHaveCount(Math.min(index + 1, limit));
      expect(await row.boundingBox()).toEqual(empty);
    }
    expect(await boxesOf(panel, REGIONS)).toEqual(regions);

    // More names than the row is wide: none is folded away, and the last is reached by scrolling.
    const reach = await chips.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(reach.scroll).toBeGreaterThan(reach.client);
    await chips.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
    const last = (await panel.getByTestId('effect-library-target-chip').last().boundingBox())!;
    const shown = (await chips.boundingBox())!;
    expect(last.x + last.width).toBeLessThanOrEqual(shown.x + shown.width + 1);
    expect(last.x).toBeGreaterThanOrEqual(shown.x - 1);
    expect(await row.boundingBox()).toEqual(empty);
  });
});
