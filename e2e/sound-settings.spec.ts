import { expect, Page, test } from '@playwright/test';

import { openPanel, openSeatDisplay, waitAppReady } from './helpers';

async function openSoundSettings(page: Page) {
  const display = await openSeatDisplay(page);
  await display.getByTestId('seat-sound-settings').click();
  const panel = page.locator('app-sound-settings-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  return panel;
}

test.describe('音の設定', () => {
  test('種類ごとの音量と消音が、開き直しても残ること', async ({ page }) => {
    await waitAppReady(page);
    let panel = await openSoundSettings(page);

    await panel.locator('input[name="handling-volume"]').fill('0.2');
    const notification = panel.getByTestId('sound-settings-row-notification').getByTestId('volume-row-mute');
    await notification.click();
    await expect(notification).toHaveAttribute('aria-pressed', 'true');

    await waitAppReady(page);
    panel = await openSoundSettings(page);

    await expect(panel.locator('input[name="handling-volume"]')).toHaveValue('0.2');
    await expect(panel.getByTestId('sound-settings-row-notification').getByTestId('volume-row-mute')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('ジュークボックスの自分の音量から開けて、同じ値を動かすこと', async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'ジュークボックス');
    const jukebox = page.locator('app-jukebox');
    await expect(jukebox).toBeVisible({ timeout: 10000 });
    await jukebox.locator('input[name="bgm-volume"]').fill('0.3');

    await jukebox.getByTestId('jukebox-open-sound-settings').click();
    const panel = page.locator('app-sound-settings-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });

    await expect(panel.locator('input[name="bgm-volume"]')).toHaveValue('0.3');
  });

  test('部屋の音量は、全体も種類ごとも PL には動かせない表示で出ること', async ({ page }) => {
    await waitAppReady(page);
    const panel = await openSoundSettings(page);

    await expect(panel.locator('input[name="room-volume"]')).toBeDisabled();
    await expect(panel.locator('input[name="room-handling-volume"]')).toBeDisabled();
    await expect(panel.locator('input[name="room-handling-volume"]')).toHaveValue('1');
  });

  test('GM がジュークボックスで動かした部屋の BGM の音量が、音の設定にも出ること', async ({ page }) => {
    await waitAppReady(page);
    const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();
    await openPanel(page, 'ジュークボックス');
    const jukebox = page.locator('app-jukebox');
    await expect(jukebox).toBeVisible({ timeout: 10000 });
    await jukebox.locator('input[name="room-bgm-volume"]').fill('0.4');

    await jukebox.getByTestId('jukebox-open-sound-settings').click();
    const panel = page.locator('app-sound-settings-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });

    await expect(panel.locator('input[name="room-bgm-volume"]')).toHaveValue('0.4');
    await expect(panel.locator('input[name="room-bgm-volume"]')).toBeEnabled();
    await expect(panel.locator('input[name="room-se-volume"]')).toHaveValue('1');
  });
});
