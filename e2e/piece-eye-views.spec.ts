import { expect, Locator, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from './dungeon-helpers';
import { openFabMenu, openPanel, revealMenuEntry, waitAppReady } from './helpers';

/**
 * The views that look at the table from a piece: Dungeondry Master mode from its eye, with what plays
 * on a piece laid over the piece where the view puts it, and the table's camera following a piece
 * from behind. Where the views put things comes of their cameras, the same whether or not the table
 * is drawn.
 */

type Hooks = { whenIdle(): Promise<void> };

/** Waits for the view to stop turning, as it glides round to where the piece now faces. */
async function standStill(view: Locator) {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(
          await view
            .locator('[data-piece]')
            .evaluateAll((pieces) => pieces.map((piece) => piece.getBoundingClientRect().left))
        );
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [250] }
    )
    .toBe(true);
}

/** Opens Dungeondry Master mode from the menu, looking out of the first piece it offers. */
async function enterTheView(page: Page): Promise<Locator> {
  await openFabMenu(page);
  const submenu = page.getByTestId('fab-submenu-table');
  if (!(await submenu.isVisible())) await page.getByTestId('fab-entry-table').click();
  await page.getByTestId('fab-entry-firstPersonView').click();
  await page.locator('context-menu').last().locator('li').first().click();
  const view = page.locator('first-person-view');
  await expect(view.locator('[data-piece]').first()).toBeAttached({ timeout: 10000 });
  return view;
}

test.describe('Dungeondry Master mode', () => {
  test('plays an effect on a piece in the view where the view puts it, laid on the view through the eye', async ({
    page,
  }) => {
    await waitAppReady(page);
    await closePanels(page);
    const view = await enterTheView(page);
    let id: string | null = null;
    for (let turn = 0; turn < 8 && !id; turn++) {
      await standStill(view);
      id = await view.locator('[data-piece]').evaluateAll((pieces) => {
        const whole = pieces.filter((piece) => {
          const box = piece.getBoundingClientRect();
          return box.left > 80 && box.top > 60 && box.right < innerWidth - 80 && box.bottom < innerHeight - 140;
        });
        return whole[0]?.getAttribute('data-piece') ?? null;
      });
      if (!id) await view.getByRole('button', { name: '右を向く' }).click();
    }
    expect(id, 'a piece standing whole in the view').not.toBeNull();
    await page.mouse.move(5, 5);
    const target = view.locator(`[data-piece="${id}"]`);
    const drawn = (await target.boundingBox())!;

    await openPanel(page, 'エフェクト');
    const panel = page.locator('app-effect-library-panel');
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('一閃');
    await panel.getByRole('button', { name: /一閃/ }).first().click();
    await closePanels(page);
    await target.dispatchEvent('click');

    const effects = view.getByTestId('first-person-effects');
    await expect(effects.locator('[data-effect-sprite], effect-canvas').first()).toBeAttached({ timeout: 5000 });
    const middle = await effects
      .locator('[data-effect-sprite], effect-canvas')
      .first()
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
    const slack = Math.max(drawn.width, drawn.height) / 2;
    expect(Math.abs(middle.x - (drawn.x + drawn.width / 2)), JSON.stringify({ middle, drawn })).toBeLessThan(slack);
    expect(Math.abs(middle.y - (drawn.y + drawn.height / 2)), JSON.stringify({ middle, drawn })).toBeLessThan(slack);
  });
});

function camera(page: Page): Promise<string | null> {
  return page.locator('[data-camera]').getAttribute('data-camera');
}

/** Waits for what the screen lays over the table to stand where the table now puts it. */
async function idle(page: Page) {
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

test.describe('following a piece from behind', () => {
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
