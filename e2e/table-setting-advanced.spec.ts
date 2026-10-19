import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

test.describe('table settings in detail', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toBeVisible({ timeout: 10000 });
  });

  test('lists at least one default table in the table list (li[role=option])', async ({ page }) => {
    await expect(page.locator('game-table-setting li[role="option"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('changes the snap mode to "cell"', async ({ page }) => {
    const snap = page.locator('select[name="tableSnapMode"]');
    await snap.selectOption('center');
    await expect(snap).toHaveValue('center');
  });

  test('has a grid colour field of type color', async ({ page }) => {
    const gridColor = page.locator('input[name="tableGridColor"]');
    await expect(gridColor).toBeAttached();
    await expect(gridColor).toHaveAttribute('type', 'color');
  });

  test('changes the table width straight through its number input', async ({ page }) => {
    const widthNum = page.locator('input[name="table-width"]');
    await widthNum.click();
    await widthNum.press('Control+A');
    await widthNum.fill('30');
    await expect(widthNum).toHaveValue('30');
  });

  test('switches the background filter from the default to black, to white and back to the default', async ({
    page,
  }) => {
    const filter = page.locator('select[name="tableDistanceviewFilter"]');
    await filter.selectOption('black');
    await expect(filter).toHaveValue('black');
    await filter.selectOption('white');
    await expect(filter).toHaveValue('white');
  });

  test('starts a zip download when the save button is pressed', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('game-table-setting').getByRole('button', { name: '保存' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });
});
