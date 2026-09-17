import { expect, Page, test } from '@playwright/test';

import { createCharacter } from '../helpers';
import { closePanels, freeze, prepare, settle, settleLazy, snap } from './fixtures';

async function castOn(page: Page, preset: string) {
  await page.locator('[data-testid="fab-entry-media"]').click();
  await settle(page);
  await page.locator('[data-testid="fab-submenu-media"] [data-testid="fab-entry-effectLibrary"]').click();
  await settleLazy(page);
  const panel = page.locator('app-effect-library-panel');
  await expect(panel).toBeVisible();
  await panel.getByPlaceholder('名前・系統で絞り込む').fill(preset);
  await settle(page);
  await panel
    .getByRole('button', { name: new RegExp(preset) })
    .first()
    .click();
  await settle(page);
  await expect(page.getByText(/コマをクリックで順に選択/).first()).toBeVisible();
  await page.locator('game-character [appmovable]').first().dispatchEvent('mousedown', { button: 0, buttons: 1 });
  await settle(page);
  await page.keyboard.press('Enter');
}

for (const [preset, name, at] of [
  ['一閃', 'effect-slash', 300],
  ['極太ビーム', 'effect-beam', 400],
] as const) {
  test(`${name} looks the same ${at}ms into the cast`, async ({ page }) => {
    await prepare(page);
    await closePanels(page);
    await createCharacter(page);
    await freeze(page);
    await castOn(page, preset);
    await settle(page, at);
    await expect(page.locator('table-effect-overlay *').first()).toBeAttached();
    await snap(page, name);
  });
}
