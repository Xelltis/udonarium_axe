import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

async function openEffectLibrary(page: Page) {
  await openPanel(page, 'エフェクト');
  await expect(page.locator('app-effect-library-panel')).toBeVisible({ timeout: 5000 });
}

test.describe('マップ演出（エフェクト）', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openEffectLibrary(page);
  });

  test('系統ごとに既定のエフェクトが並ぶこと', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');

    await expect(panel.getByText('物理', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: /斬撃/ }).first()).toBeVisible();
  });

  test('名前で絞り込めること', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('爆炎');

    await expect(panel.getByRole('button', { name: /爆炎/ }).first()).toBeVisible();
    await expect(panel.getByRole('button', { name: /斬撃/ })).toHaveCount(0);
  });

  test('エフェクトを選ぶと対象選択に入り、コマを選ぶと盤面に演出が出ること', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');
    // 尺の長い単体エフェクトを使う。短いものは撃った直後に消えて確かめられない。
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('一閃');
    await panel.getByRole('button', { name: /一閃/ }).first().click();

    // 対象選択のヒントが出る。
    await expect(page.getByText(/コマをクリックで順に選択/).first()).toBeVisible({ timeout: 5000 });

    // 単体対象なので、コマを 1 つ選んだ時点で発動する。
    // コマの掴む要素へ直接送る。host は大きさを持たず、クリックが当たらない。
    await page.locator('game-character [appmovable]').first().dispatchEvent('mousedown', { button: 0, buttons: 1 });

    await expect(page.locator('table-effect-overlay > div').first()).toBeAttached({ timeout: 5000 });
  });

  test('対象選択を Esc で中止できること', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('斬撃');
    await panel.getByRole('button', { name: /斬撃/ }).first().click();
    await expect(page.getByText(/コマをクリックで順に選択/).first()).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(page.getByText(/コマをクリックで順に選択/)).toHaveCount(0);
  });

  test('右クリックから編集画面を開けること', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('斬撃');
    await panel.getByRole('button', { name: /斬撃/ }).first().dispatchEvent('contextmenu');

    await page.locator('context-menu').getByText('編集', { exact: true }).click();

    await expect(page.locator('app-effect-preset-editor')).toBeVisible({ timeout: 5000 });
    // 「弾の見た目」など部分一致する項目が増えたので、節の見出しだけを指す。
    await expect(page.locator('app-effect-preset-editor').getByText('見た目', { exact: true })).toBeVisible();
  });
});
