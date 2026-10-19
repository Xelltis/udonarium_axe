import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('the alarm menu', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    // The alarm button in the chat window, the bell left of the gear.
    await page.locator('chat-window button[title="アラーム"]').click();
    await expect(page.locator('app-alarm-menu')).toBeVisible({ timeout: 5000 });
  });

  test('opens the menu from the alarm button', async ({ page }) => {
    await expect(page.locator('app-alarm-menu input[name="alarmTitle"]')).toBeVisible();
    await expect(page.locator('app-alarm-menu input[name="alarmTime"]')).toBeVisible();
  });

  test('edits the title field', async ({ page }) => {
    const titleInput = page.locator('app-alarm-menu input[name="alarmTitle"]');
    await titleInput.fill('戦闘ラウンド');
    await expect(titleInput).toHaveValue('戦闘ラウンド');
  });

  test('edits the time field', async ({ page }) => {
    const timeInput = page.locator('app-alarm-menu input[name="alarmTime"]');
    await timeInput.fill('30');
    await expect(timeInput).toHaveValue('30');
  });

  test('has the three checkboxes for sound, pop-up and including oneself', async ({ page }) => {
    await expect(page.locator('app-alarm-menu input[name="isSound"]')).toBeAttached();
    await expect(page.locator('app-alarm-menu input[name="isPopUp"]')).toBeAttached();
    await expect(page.locator('app-alarm-menu input[name="includSelf"]')).toBeAttached();
  });

  test('leaves nobody to alert and disables the set button once "include myself" is unchecked', async ({ page }) => {
    // includSelf is true by default, so at first oneself alone is counted. Unchecking it makes
    // selectedNum === 0, which disables the set button.
    const includeSelf = page.locator('app-alarm-menu input[name="includSelf"]');
    await includeSelf.uncheck();
    const setBtn = page.locator('app-alarm-menu').getByRole('button', { name: /セット/ });
    await expect(setBtn).toBeDisabled();
  });

  test('shows the message for when nobody but oneself is in the room', async ({ page }) => {
    await expect(page.locator('app-alarm-menu').getByText('自分しか部屋にいません')).toBeVisible();
  });
});
