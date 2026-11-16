import { expect, Page, test } from '@playwright/test';

import { createCharacter } from '../helpers';
import { closePanels, freeze, prepare, settle, settleLazy, snap, untilStill } from './fixtures';

/** How many particles and marks on the floor the effects draw in the table's scene now. */
function effectsDrawn(page: Page): Promise<number> {
  return page.evaluate(() => window.__axeTable?.sceneStats()?.effects ?? 0);
}

async function castOn(page: Page, preset: string) {
  await page.locator('[data-testid="fab-entry-media"]').click();
  await settle(page);
  await page.locator('[data-testid="fab-submenu-media"] [data-testid="fab-entry-effectLibrary"]').click();
  const panel = page.locator('effect-library-panel');
  const filter = panel.getByPlaceholder(/名前・系統/);
  await settleLazy(page, filter);
  await expect(panel).toBeVisible();
  await filter.fill(preset);
  await settle(page);
  await panel
    .getByRole('button', { name: new RegExp('^\\s*' + preset) })
    .first()
    .click();
  await settle(page);
  await expect(page.getByText(/コマを押して対象を選ぶ/).first()).toBeVisible();
  await page.locator('game-character [appmovable]').first().dispatchEvent('mousedown', { button: 0, buttons: 1 });
  await settle(page);
  // Picking casts nothing: the cast is the Enter, a step of the clock after the pick.
  await page.keyboard.press('Enter');
  await settle(page);
}

for (const [preset, name, at, differs] of [
  // Each as it strikes: a drawing cut flashes once its stance is held, a great beam once it has gathered.
  // The streaks down a great beam are laid by the seed of its cast, which is drawn anew each time, so
  // its picture is held to where the beam runs and what colour it is rather than to each streak.
  ['一閃', 'effect-slash', 1700, 0],
  ['極太ビーム', 'effect-beam', 1400, 0.08],
] as const) {
  test(`${name} looks the same ${at}ms into the cast`, async ({ page }) => {
    await prepare(page);
    await closePanels(page);
    await createCharacter(page);
    await untilStill(page);
    await freeze(page);
    await castOn(page, preset);
    await settle(page, at);
    expect(await effectsDrawn(page)).toBeGreaterThan(0);
    await snap(page, name, differs > 0 ? { maxDiffPixelRatio: differs } : {});
  });
}
