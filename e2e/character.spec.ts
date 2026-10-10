import { expect, test } from '@playwright/test';

import { createCharacter, waitAppReady } from './helpers';

test.describe('キャラクターのコンテキストメニュー', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  });

  test('主要メニュー項目 (詳細/チャパレ/リモコン/バフ/コピー) が揃っていること', async ({ page }) => {
    const menu = page.locator('context-menu');
    await expect(menu.getByText('詳細を表示')).toBeVisible();
    await expect(menu.getByText('チャットパレットを表示')).toBeVisible();
    await expect(menu.getByText('リモコンを表示')).toBeVisible();
    await expect(menu.getByText('バフ編集')).toBeVisible();
    await expect(menu.getByText('コピーを作る')).toBeVisible();
  });

  test('「バフ編集」でバフ編集パネルが開けること', async ({ page }) => {
    await page.locator('context-menu').getByText('バフ編集').click();
    await expect(page.locator('game-character-buff-view')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('game-character-buff-view').getByRole('button', { name: /バフを追加/ })).toBeVisible();
  });

  test('「バフ編集」でバフを追加できること', async ({ page }) => {
    await page.locator('context-menu').getByText('バフ編集').click();
    await expect(page.locator('game-character-buff-view')).toBeVisible({ timeout: 5000 });
    const before = await page.locator('game-character-buff-view [game-data-element-buff]').count();
    await page
      .locator('game-character-buff-view')
      .getByRole('button', { name: /バフを追加/ })
      .click();
    await expect
      .poll(() => page.locator('game-character-buff-view [game-data-element-buff]').count(), {
        timeout: 5000,
      })
      .toBeGreaterThan(before);
  });

  test('高度設定サブメニューに「高度を0にする」があること', async ({ page }) => {
    await page.locator('context-menu').getByText('高度設定').hover();
    await expect(page.locator('context-menu').getByText('高度を0にする')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('キャラクターシート (詳細パネル)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
    await page.locator('context-menu').getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });

  test('保存ボタンで XML データを内包した zip がダウンロードされること', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('game-character-sheet').getByRole('button', { name: '保存' }).click();
    const download = await downloadPromise;
    // SaveDataServiceはキャラ単体でもxml_<name>_<timestamp>.zip形式で保存する。
    expect(download.suggestedFilename()).toMatch(/^xml_.*\.zip$/);
  });
});

test.describe('リソースのスライダー表示', () => {
  test('HP にスライダー表示を入れると、シートと簡易表示の両方で現在値だけをスライダーで動かせること', async ({
    page,
  }) => {
    await waitAppReady(page);
    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
    await piece.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // The HP row is the first resource of the first section, whose settings open from its tune button.
    await sheet.getByRole('button', { name: 'edit', exact: true }).first().click();
    await sheet.getByRole('button', { name: 'tune', exact: true }).first().click();
    await sheet.locator('input[name="data-resource-slider"]').first().check();
    await sheet.getByRole('button', { name: 'edit_off', exact: true }).first().click();

    const sheetSlider = sheet.getByTestId('resource-slider').first();
    await expect(sheetSlider).toBeVisible();
    const hpRow = sheet
      .locator('game-data-element, [game-data-element]')
      .filter({ has: page.getByTestId('resource-slider') })
      .last();
    const max = await hpRow.locator('input[name="data-value"]').inputValue();
    await sheetSlider.fill('5');
    await expect(hpRow.locator('input[name="data-current-value"]')).toHaveValue('5');
    await expect(hpRow.locator('input[name="data-value"]')).toHaveValue(max);

    // The title bar's buttons only show under the pointer.
    await page
      .locator('ui-panel', { has: sheet })
      .locator('button:has(i:text-is("close"))')
      .last()
      .dispatchEvent('click');
    await expect(sheet).toHaveCount(0);
    const picture = (await piece.locator('img.image').first().boundingBox())!;
    await page.mouse.move(picture.x + picture.width / 2, picture.y + picture.height / 2);
    await page.mouse.move(picture.x + picture.width / 2 + 2, picture.y + picture.height / 2 + 2);

    const popupSlider = page.getByTestId('overview-resource-slider').first();
    await expect(popupSlider).toBeVisible({ timeout: 5000 });
    await expect(popupSlider).toHaveValue('5');
    await popupSlider.fill('40');
    await expect(page.locator('overview-panel input[name="data-current-value"]').first()).toHaveValue('40');
    await expect(page.locator('overview-panel').getByText(max, { exact: true }).first()).toBeAttached();
  });
});
