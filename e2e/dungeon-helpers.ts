import { expect, Locator, Page } from '@playwright/test';

import { openPanel } from './helpers';

/** Takes the GM seat from the connection panel the app opens with. */
export async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

async function typeInto(input: Locator, text: string) {
  await input.click();
  await input.press('Control+a');
  await input.pressSequentially(text);
}

/** Builds a small dungeon from a fixed seed on the grid named, and goes to its table. */
export async function buildDungeon(page: Page, gridLabel: string) {
  await openPanel(page, 'マップ生成');
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: gridLabel, exact: true }).click();
  await typeInto(panel.locator('input[name="room-count-number"]'), '3');
  await typeInto(panel.locator('#seed'), '1278372739');
  await panel.getByRole('button', { name: '生成する' }).click();
  await panel.getByRole('button', { name: 'このテーブルへ移動' }).click({ timeout: 120000 });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __axeTable?: { sceneStats(): { chunks: number } | null } }).__axeTable?.sceneStats()
              ?.chunks ?? 0
        ),
      { timeout: 20000 }
    )
    .toBeGreaterThan(0);
  const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
  if (await later.count()) await later.first().dispatchEvent('click');
  await closePanels(page);
}

/** Closes every panel, one at a time from the top. */
export async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
}
