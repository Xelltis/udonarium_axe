import { expect, Locator, Page } from '@playwright/test';

import { closePanels, openPanel } from './helpers';

async function typeInto(input: Locator, text: string) {
  await input.click();
  await input.press('Control+a');
  await input.pressSequentially(text);
}

/**
 * Generates a small dungeon from a fixed seed on the grid named and goes to its table, running
 * `whenThere` once the table is gone to, before the panels are closed.
 */
async function generateDungeon(page: Page, gridLabel: string, whenThere: () => Promise<void>) {
  await openPanel(page, 'マップ生成');
  const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
  await panel.getByRole('button', { name: gridLabel, exact: true }).click();
  await typeInto(panel.locator('input[name="room-count-number"]'), '3');
  await typeInto(panel.locator('#seed'), '1278372739');
  await panel.getByRole('button', { name: '生成する' }).click();
  await panel.getByRole('button', { name: 'このテーブルへ移動' }).click({ timeout: 120000 });
  await whenThere();
  const later = page.locator('room-restore-banner button', { hasText: 'あとで' });
  if (await later.count()) await later.first().dispatchEvent('click');
  await closePanels(page);
}

/** Builds a small dungeon from a fixed seed on the grid named, and goes to its table, once the canvas holds its blocks. */
export async function buildDungeon(page: Page, gridLabel: string) {
  await generateDungeon(page, gridLabel, () =>
    expect
      .poll(() => page.evaluate(() => window.__axeTable?.sceneStats()?.chunks ?? 0), { timeout: 20000 })
      .toBeGreaterThan(0)
  );
}

/**
 * Builds a small dungeon from a fixed seed on the grid named, and goes to its table, where the table
 * is not drawn and no canvas comes to hold its blocks.
 */
export async function buildDungeonUndrawn(page: Page, gridLabel: string) {
  await generateDungeon(page, gridLabel, () => Promise.resolve());
}
