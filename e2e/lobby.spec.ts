import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/**
 * The connection panel is where every session starts, and it had no coverage.
 * The suite runs against a backend that answers nothing on purpose, so this
 * stops at what the browser owns: the panel's own controls, and the lobby
 * reporting honestly that it found no rooms rather than hanging or blanking.
 */
test.describe('接続パネルとロビー', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('peer-menu')).toBeVisible({ timeout: 10000 });
  });

  test('ニックネームを変えるとチャットの発言者名に反映されること', async ({ page }) => {
    const nickname = page.locator('peer-menu input[name="peer-name"]');
    await expect(nickname).toBeVisible();
    await nickname.fill('語り部');

    // 発言者の選択欄は自分の名前を「（あなた）」付きで出す。
    await expect(page.locator('chat-input')).toContainText('語り部', { timeout: 10000 });
  });

  test('「詳細を表示」で接続の内訳が開くこと', async ({ page }) => {
    const detail = page.locator('peer-menu input[name="disp-detail-flag"]');
    await expect(detail).not.toBeChecked();

    const before = (await page.locator('peer-menu').innerText()).length;
    // パネルの下側は起動時に開くチャットウィンドウに重なるので、イベントを直接送る。
    await detail.dispatchEvent('click');
    await expect(detail).toBeChecked();

    // 折りたたまれていた内訳が開くので、パネルの中身が増える。
    await expect
      .poll(async () => (await page.locator('peer-menu').innerText()).length, { timeout: 5000 })
      .toBeGreaterThan(before);
  });

  test('通信できないときロビーは空だと正直に伝えること', async ({ page }) => {
    await page
      .locator('peer-menu')
      .getByRole('button', { name: /ロビー/ })
      .dispatchEvent('click');

    const lobby = page.locator('lobby');
    await expect(lobby).toBeVisible({ timeout: 15000 });
    // 何も知らせずに空欄になるのではなく、見つからなかったことと次の一手が出る。
    await expect(lobby).toContainText('接続可能なルームが見つかりませんでした');
    await expect(lobby.getByRole('button', { name: /新しいルームを作成する/ })).toBeVisible();
    await expect(lobby.getByRole('button', { name: /一覧を更新/ })).toBeVisible();
  });

  test('ロビーからルーム作成フォームを開けること', async ({ page }) => {
    await page
      .locator('peer-menu')
      .getByRole('button', { name: /ロビー/ })
      .dispatchEvent('click');
    await expect(page.locator('lobby')).toBeVisible({ timeout: 15000 });

    await page
      .locator('lobby')
      .getByRole('button', { name: /新しいルームを作成する/ })
      .click();
    await expect(page.locator('room-setting')).toBeVisible({ timeout: 10000 });
  });

  test('役割は自分で切り替えられ、ツールバーが追随すること', async ({ page }) => {
    const roles = page.locator('peer-menu');
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });

    await roles.getByRole('button', { name: /^\s*見学\s*$/ }).click();
    // 見学は読み取り専用なので、どちらのツールバーも出ない。
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toHaveCount(0);

    await roles.getByRole('button', { name: /^\s*PL\s*$/ }).click();
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
  });
});
