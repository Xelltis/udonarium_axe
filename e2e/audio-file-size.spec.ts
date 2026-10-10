import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

test.describe('大きすぎる音源', () => {
  test('10MB を超える音源は取り込まず、そのことを画面の下で知らせること', async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'ジュークボックス');
    const jukebox = page.locator('app-jukebox');
    await expect(jukebox).toBeVisible({ timeout: 10000 });

    await jukebox.locator('input[type="file"][accept="audio/*"]').setInputFiles([
      { name: 'Long.ogg', mimeType: 'audio/ogg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
      { name: 'Short.ogg', mimeType: 'audio/ogg', buffer: Buffer.alloc(1024) },
    ]);

    const notice = page.getByTestId('snackbar');
    await expect(notice).toContainText('「Long.ogg」は大きすぎるため読み込めませんでした');
    await expect(notice).toContainText('音源は10MBまで');
    await expect(jukebox.getByText('Short.ogg', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(jukebox.getByText('Long.ogg', { exact: true })).toHaveCount(0);
  });
});
