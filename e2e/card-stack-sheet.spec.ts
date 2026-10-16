import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function openCardStackSheet(page: Page) {
  await waitAppReady(page);
  const tableMenu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, tableMenu, 'トランプの山札を作成')).click();
  await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
  await page.locator('card-stack').first().dispatchEvent('contextmenu');
  await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  await page.locator('context-menu').getByText('詳細を表示').click();
  await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
}

test.describe('the detail sheet of a card-stack', () => {
  test.beforeEach(async ({ page }) => {
    await openCardStackSheet(page);
  });

  test('gives the card-stack sheet its copy and save buttons and its tabs', async ({ page }) => {
    const sheet = page.locator('game-character-sheet');
    await expect(sheet.getByRole('button', { name: 'コピーを作る' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '保存' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /カード一覧/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /設定/ })).toBeVisible();
  });

  test('keeps the sheet whole when the tabs are switched back and forth', async ({ page }) => {
    const sheet = page.locator('game-character-sheet');
    const settings = sheet.getByRole('button', { name: /設定/ });
    const cards = sheet.getByRole('button', { name: /カード一覧/ });

    await settings.dispatchEvent('click');
    await expect(sheet).toContainText('基本情報');
    await cards.dispatchEvent('click');
    await expect(cards).toBeVisible();
  });

  test('downloads a zip holding the .xml data from the save button', async ({ page }) => {
    const sheet = page.locator('game-character-sheet');
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await sheet.getByRole('button', { name: '保存' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^xml_.*\.zip$/);
  });
});
