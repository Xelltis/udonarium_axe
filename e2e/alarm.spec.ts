import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('the alarm', () => {
  test('goes off for oneself under its title once the seconds set from the alarm button have passed', async ({
    page,
  }) => {
    await waitAppReady(page);
    await page.locator('chat-window button[title="アラーム"]').click();
    const menu = page.locator('app-alarm-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });

    await menu.locator('input[name="alarmTitle"]').fill('戦闘ラウンド');
    await menu.locator('input[name="alarmTime"]').fill('1');
    await menu.getByRole('button', { name: /セット/ }).click();
    await expect(menu).toHaveCount(0);

    const alarm = page.locator('app-alarm-window');
    await expect(alarm).toBeVisible({ timeout: 10000 });
    await expect(alarm).toContainText('戦闘ラウンド');
    await expect(alarm).toContainText('1秒経過');
  });
});
