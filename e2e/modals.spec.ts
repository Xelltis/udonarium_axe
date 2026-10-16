import { expect, Locator, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('the change-icon modal (file-selector)', () => {
  test('opens the file-selector modal from "change icon"', async ({ page }) => {
    await waitAppReady(page);
    // The avatar image in peer-menu (title="アイコンを変更する"), or a button with the same aria-label.
    const trigger = page.locator('peer-menu [title="アイコンを変更する"], peer-menu [aria-label="アイコンを変更する"]');
    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // There is at least one tag radio (image-chg inside file-selector).
    await expect(page.locator('file-selector input[name="image-chg"]').first()).toBeAttached();
  });

  test('closes the file-selector with the modal’s × button', async ({ page }) => {
    await waitAppReady(page);
    const trigger = page.locator('peer-menu [title="アイコンを変更する"], peer-menu [aria-label="アイコンを変更する"]');
    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // changeIcon has isAllowedEmpty=false, so there is no "no image" choice; the modal is closed with
    // the close button every modal has at its top right (i.material-icons "close").
    await page.locator('modal').locator('i.material-icons', { hasText: 'close' }).click();
    await expect(page.locator('file-selector')).toHaveCount(0, { timeout: 5000 });
  });

  test('closes the file-selector on a click outside the modal (on the backdrop)', async ({ page }) => {
    await waitAppReady(page);
    const trigger = page.locator('peer-menu [title="アイコンを変更する"], peer-menu [aria-label="アイコンを変更する"]');
    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // The backdrop layer, at z-index:-1, visually overlaps the modal body, so a click at absolute
    // coordinates outside the body (5,5 at the top left) fires clickBackground.
    await page.mouse.click(5, 5);
    await expect(page.locator('file-selector')).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe('editing chat messages', () => {
  /**
   * Returns the row just sent. A row filtered by its text would slip away once editing starts, as the text
   * moves into the textarea's value, so once the message has arrived the row is taken again by position.
   * Rows are not counted because the first message sent clears the tutorial.
   */
  async function sendMessage(page: Page, text: string) {
    const rows = page.locator('chat-message');
    await page.locator('textarea.chat-input').fill(text);
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expect(rows.filter({ hasText: text })).toHaveCount(1, { timeout: 5000 });
    return rows.last();
  }

  /**
   * The edit icon shows when the pointer is over the row. A forced click does not check that the icon can be
   * pressed, so in Firefox it can land on the element beneath instead. The pointer is moved over first, and
   * the icon pressed as usual.
   */
  async function startEdit(row: Locator) {
    await row.hover();
    await row.locator('i.material-icons', { hasText: 'edit' }).first().click();
  }

  test('edits one’s own sent message in place from the edit icon', async ({ page }) => {
    await waitAppReady(page);
    const row = await sendMessage(page, '編集テスト');

    // It turns into a textarea in place rather than opening another modal.
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

  test('leaves the text as it was when the edit is cancelled', async ({ page }) => {
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
