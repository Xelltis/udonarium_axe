import { expect, Page, test } from '@playwright/test';

import { openPanel } from '../helpers';
import { closePanels, freeze, openTableSetting, prepare, settle, snap } from './fixtures';

/**
 * Opens a part of the room settings by its tab, the click sent to the tab itself. A click made the
 * usual way first scrolls the tab into view, and on a busy page that catches the panel still settling
 * and scrolls what it holds up by the gap above the tabs.
 */
async function openPart(page: Page, part: string) {
  await page.locator(`[data-testid="room-settings-tab-${part}"]`).dispatchEvent('click');
}

test('the table setting looks the same', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openTableSetting(page);
  await settle(page, 400);
  await snap(page, 'panels-table-setting');
});

test('the room settings look the same', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openPanel(page, '部屋設定');
  await expect(page.locator('room-settings-panel')).toBeVisible({ timeout: 10000 });
  await settle(page, 400);
  await snap(page, 'panels-room-settings');
});

test('the room settings look the same on a part with a form in it', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openPanel(page, '部屋設定');
  await expect(page.locator('room-settings-panel')).toBeVisible({ timeout: 10000 });
  await settle(page, 400);
  await openPart(page, 'move');
  await settle(page, 400);
  await snap(page, 'panels-room-settings-move');
});

test('the room settings look the same on the part another panel sits in', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openPanel(page, '部屋設定');
  await expect(page.locator('room-settings-panel')).toBeVisible({ timeout: 10000 });
  await settle(page, 400);
  await openPart(page, 'archive');
  await settle(page, 400);
  await snap(page, 'panels-room-settings-archive');
});

/**
 * How wide the new cut-in's picture is of itself, which the editor shows once the picture has come:
 * a table drawn on a canvas has no picture of the board on the page, so it comes later there.
 */
const PICTURE_WIDTH = '1600';

test('the cut-in editor looks the same', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await openPanel(page, 'カットイン');
  await expect(page.locator('app-cut-in-list')).toBeVisible({ timeout: 10000 });
  await page.locator('app-cut-in-list button[title="新しいカットインを作る"]').click();
  await expect(page.locator('app-cut-in-list cut-in-editor')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('cut-in-editor input[name="cut-in-width"]')).toHaveValue(PICTURE_WIDTH, { timeout: 10000 });
  await snap(page, 'panels-cut-in-editor');
});
