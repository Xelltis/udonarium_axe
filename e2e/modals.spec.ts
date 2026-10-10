import { expect, Locator, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('アイコン変更モーダル (file-selector)', () => {
  test('「アイコンを変更する」を押すと file-selector モーダルが開けること', async ({ page }) => {
    await waitAppReady(page);
    // peer-menu内のアバター画像（title="アイコンを変更する"）、または同じaria-labelのボタン。
    const trigger = page.locator('peer-menu [title="アイコンを変更する"], peer-menu [aria-label="アイコンを変更する"]');
    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // タグラジオが少なくとも1件ある（file-selector内のimage-chg）。
    await expect(page.locator('file-selector input[name="image-chg"]').first()).toBeAttached();
  });

  test('モーダルの×ボタンで file-selector を閉じれること', async ({ page }) => {
    await waitAppReady(page);
    const trigger = page.locator('peer-menu [title="アイコンを変更する"], peer-menu [aria-label="アイコンを変更する"]');
    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // changeIconはisAllowedEmpty=falseなので「画像なし」は出ない。そのためモーダル
    // 共通の右上のclose（i.material-icons "close"）で閉じる。
    await page.locator('modal').locator('i.material-icons', { hasText: 'close' }).click();
    await expect(page.locator('file-selector')).toHaveCount(0, { timeout: 5000 });
  });

  test('モーダル外側 (背景) をクリックで file-selector を閉じれること', async ({ page }) => {
    await waitAppReady(page);
    const trigger = page.locator('peer-menu [title="アイコンを変更する"], peer-menu [aria-label="アイコンを変更する"]');
    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // 背景レイヤーはz-index:-1でモーダル本体に視覚的に被るため、本体の外側
    // （左上の5,5）を絶対座標でクリックしてclickBackgroundを発火する。
    await page.mouse.click(5, 5);
    await expect(page.locator('file-selector')).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe('チャットメッセージの編集', () => {
  /**
   * 送った直後の行を返す。本文で絞り込んだままだと、編集に入った時点で本文が
   * テキストエリアの値に移って掴めなくなるので、届いたことを確かめてから位置で
   * 押さえ直す。件数で数えないのは、最初の送信でチュートリアルが消えるため。
   */
  async function sendMessage(page: Page, text: string) {
    const rows = page.locator('chat-message');
    await page.locator('textarea.chat-input').fill(text);
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expect(rows.filter({ hasText: text })).toHaveCount(1, { timeout: 5000 });
    return rows.last();
  }

  /**
   * 編集アイコンは行にポインタを乗せると見える。forceで押すと押せる状態かを確かめないので、
   * Firefoxではアイコンでなく下の要素に当たることがある。乗せてから普通に押す。
   */
  async function startEdit(row: Locator) {
    await row.hover();
    await row.locator('i.material-icons', { hasText: 'edit' }).first().click();
  }

  test('自分の送信メッセージは edit アイコンからその場で編集できること', async ({ page }) => {
    await waitAppReady(page);
    const row = await sendMessage(page, '編集テスト');

    // 別モーダルではなく、その場でテキストエリアに切り替わる。
    await startEdit(row);
    const editing = row.locator('textarea');
    await expect(editing).toBeVisible({ timeout: 5000 });
    await expect(editing).toHaveValue('編集テスト');

    await editing.fill('編集しました');
    await row.getByRole('button', { name: '変更' }).click();

    await expect(editing).toBeHidden();
    await expect(row).toContainText('編集しました');
    await expect(row).toContainText('編集済');
  });

  test('編集をキャンセルすると本文が元のままであること', async ({ page }) => {
    await waitAppReady(page);
    const row = await sendMessage(page, '取消テスト');

    await startEdit(row);
    const editing = row.locator('textarea');
    await expect(editing).toBeVisible({ timeout: 5000 });
    await editing.fill('捨てる文');
    await row.getByRole('button', { name: 'キャンセル' }).click();

    await expect(editing).toBeHidden();
    await expect(row).toContainText('取消テスト');
    await expect(row).not.toContainText('編集済');
  });
});
