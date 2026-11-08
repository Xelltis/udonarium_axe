import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('the change-icon modal (file-selector)', () => {
  test('closes the file-selector with the modal’s × button, and on a click outside the modal (on the backdrop)', async ({
    page,
  }) => {
    await waitAppReady(page);
    // The avatar image in peer-menu (title="アイコンを変更する"), or a button with the same aria-label.
    const trigger = page.locator('peer-menu [title="アイコンを変更する"], peer-menu [aria-label="アイコンを変更する"]');
    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // changeIcon has isAllowedEmpty=false, so there is no "no image" choice; the modal is closed with
    // the close button every modal has at its top right (i.material-icons "close").
    await page.locator('modal').locator('i.material-icons', { hasText: 'close' }).click();
    await expect(page.locator('file-selector')).toHaveCount(0, { timeout: 5000 });

    await trigger.first().click();
    await expect(page.locator('file-selector')).toBeVisible({ timeout: 5000 });
    // The backdrop layer, at z-index:-1, visually overlaps the modal body, so a click at absolute
    // coordinates outside the body (5,5 at the top left) fires clickBackground.
    await page.mouse.click(5, 5);
    await expect(page.locator('file-selector')).toHaveCount(0, { timeout: 5000 });
  });
});
