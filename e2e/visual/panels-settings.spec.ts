import { expect, test } from '@playwright/test';

import { openPanel } from '../helpers';
import { closePanels, freeze, openTableSetting, prepare, settle, snap } from './fixtures';

test('the table setting looks the same', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openTableSetting(page);
  await settle(page, 400);
  await snap(page, 'panels-table-setting', { maxDiffPixelRatio: 0.001, threshold: 0.1 });
});

test('the room settings look the same', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openPanel(page, '部屋設定');
  await expect(page.locator('room-settings-panel')).toBeVisible({ timeout: 10000 });
  await settle(page, 400);
  await snap(page, 'panels-room-settings', { maxDiffPixelRatio: 0.001, threshold: 0.1 });
});

test('the room settings look the same on a part with a form in it', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openPanel(page, '部屋設定');
  await expect(page.locator('room-settings-panel')).toBeVisible({ timeout: 10000 });
  await settle(page, 400);
  await page.locator('[data-testid="room-settings-tab-move"]').click();
  await settle(page, 400);
  await snap(page, 'panels-room-settings-move', { maxDiffPixelRatio: 0.001, threshold: 0.1 });
});

test('the room settings look the same on the part another panel sits in', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await freeze(page);
  await openPanel(page, '部屋設定');
  await expect(page.locator('room-settings-panel')).toBeVisible({ timeout: 10000 });
  await settle(page, 400);
  await page.locator('[data-testid="room-settings-tab-archive"]').click();
  await settle(page, 400);
  await snap(page, 'panels-room-settings-archive', { maxDiffPixelRatio: 0.001, threshold: 0.1 });
});

test('the cut-in editor looks the same', async ({ page }) => {
  await prepare(page);
  await closePanels(page);
  await openPanel(page, 'カットイン');
  await expect(page.locator('app-cut-in-list')).toBeVisible({ timeout: 10000 });
  await page.locator('app-cut-in-list button[title="新しいカットインを作る"]').click();
  await expect(page.locator('app-cut-in-list cut-in-editor')).toBeVisible({ timeout: 5000 });
  await snap(page, 'panels-cut-in-editor', { maxDiffPixelRatio: 0.001, threshold: 0.1 });
});
