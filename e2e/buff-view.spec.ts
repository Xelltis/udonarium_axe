import { expect, Page, test } from '@playwright/test';

import { createCharacter, waitAppReady } from './helpers';

async function openBuffView(page: Page) {
  await waitAppReady(page);
  await createCharacter(page);
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  await page.locator('context-menu').getByText('バフ編集').click();
  await expect(page.locator('game-character-buff-view')).toBeVisible({ timeout: 5000 });
}

test.describe('バフ編集ビュー (game-character-buff-view)', () => {
  test.beforeEach(async ({ page }) => {
    await openBuffView(page);
  });

  test('バフが 0 件のキャラには「バフ・デバフは登録されていません」が出ること', async ({ page }) => {
    // createCharacterで作った新規キャラはバフ0件。表示行がある場合は何もしない。
    const items = page.locator('game-character-buff-view [game-data-element-buff]');
    if ((await items.count()) === 0) {
      await expect(
        page.locator('game-character-buff-view').getByText('バフ・デバフは登録されていません')
      ).toBeVisible();
    } else {
      test.skip(true, '既存バフがあるキャラのため空メッセージ確認をスキップ');
    }
  });

  test('「バフを追加」を 3 回押すとバフアイテムが 3 つ以上増えること', async ({ page }) => {
    const before = await page.locator('game-character-buff-view [game-data-element-buff]').count();
    for (let i = 0; i < 3; i++) {
      await page
        .locator('game-character-buff-view')
        .getByRole('button', { name: /バフを追加/ })
        .click();
    }
    await expect
      .poll(() => page.locator('game-character-buff-view [game-data-element-buff]').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(before + 3);
  });

  test('バフ名入力欄に値を入力できること', async ({ page }) => {
    // 最初のバフ（data-elm-name）を編集。
    const nameInputs = page.locator('game-character-buff-view input[name="data-elm-name"]');
    await expect(nameInputs.first()).toBeVisible({ timeout: 5000 });
    const first = nameInputs.first();
    await first.click();
    await first.press('Control+A');
    await first.fill('猛攻撃');
    await expect(first).toHaveValue('猛攻撃');
  });

  test('バッジの色を選ぶとコマの丸いバッジがその色になること', async ({ page }) => {
    await page
      .locator('game-character-buff-view')
      .getByRole('button', { name: /バフを追加/ })
      .click();

    const view = page.locator('game-character-buff-view');
    const picker = view.locator('details').first();
    await picker.locator('summary').click();
    await picker.locator('button[title="red"]').click();
    await expect(picker.locator('summary')).toHaveCSS('background-color', 'rgb(198, 40, 40)', { timeout: 5000 });

    const badge = page.locator('game-character').first().locator('[data-testid="buff-badge"] > span').first();
    await expect(badge).toBeAttached({ timeout: 5000 });

    await expect(badge).toHaveCSS('background-color', 'rgb(198, 40, 40)', { timeout: 5000 });

    const shape = await badge.evaluate((element) => {
      const computed = getComputedStyle(element as HTMLElement);
      return { radius: parseFloat(computed.borderRadius), width: element.clientWidth };
    });

    expect(shape.radius, 'バッジが丸くない').toBeGreaterThanOrEqual(shape.width / 2 - 1);
  });

  test('「バフを削除」ボタンで該当行が消えること', async ({ page }) => {
    const before = await page.locator('game-character-buff-view [game-data-element-buff]').count();
    // 最初のバフのゴミ箱アイコン（title="バフを削除"）
    await page.locator('game-character-buff-view button[title="バフを削除"]').first().click();
    await expect
      .poll(() => page.locator('game-character-buff-view [game-data-element-buff]').count(), {
        timeout: 5000,
      })
      .toBeLessThan(before);
  });
});
