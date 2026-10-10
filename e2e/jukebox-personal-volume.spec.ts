import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

async function openJukebox(page: Page) {
  await openPanel(page, 'ジュークボックス');
  const jukebox = page.locator('app-jukebox');
  await expect(jukebox).toBeVisible({ timeout: 10000 });
  return jukebox;
}

test.describe('ジュークボックスの個人音量', () => {
  test('試聴・BGM・SE・環境音の音量が、開き直しても残ること', async ({ page }) => {
    await waitAppReady(page);
    let jukebox = await openJukebox(page);
    await jukebox.locator('input[name="audition-volume"]').fill('0.1');
    await jukebox.locator('input[name="bgm-volume"]').fill('0.2');
    await jukebox.locator('input[name="se-volume"]').fill('0.3');
    await jukebox.locator('input[name="background-volume"]').fill('0.4');

    await waitAppReady(page);
    jukebox = await openJukebox(page);

    await expect(jukebox.locator('input[name="audition-volume"]')).toHaveValue('0.1');
    await expect(jukebox.locator('input[name="bgm-volume"]')).toHaveValue('0.2');
    await expect(jukebox.locator('input[name="se-volume"]')).toHaveValue('0.3');
    await expect(jukebox.locator('input[name="background-volume"]')).toHaveValue('0.4');
  });
});
