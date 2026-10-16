import { expect, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

test.describe('the cut-in editor (cut-in-editor)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'カットイン');
    await expect(page.locator('app-cut-in-list')).toBeVisible({ timeout: 10000 });
    // Makes a new cut-in to open the editor in the right pane.
    await page.locator('app-cut-in-list button[title="新しいカットインを作る"]').click();
    await expect(page.locator('app-cut-in-list cut-in-editor')).toBeVisible({ timeout: 5000 });
  });

  test('takes a cut-in name, a tag name and the seconds to show', async ({ page }) => {
    const name = page.locator('cut-in-editor input[name="cut-in-name"]');
    const tag = page.locator('cut-in-editor input[name="cut-in-tag-name"]');
    const outTime = page.locator('cut-in-editor input[name="cut-in-out-time"]');
    await name.fill('オープニング');
    await tag.fill('BGM');
    await outTime.click();
    await outTime.press('Control+A');
    await outTime.fill('5');
    await expect(name).toHaveValue('オープニング');
    await expect(tag).toHaveValue('BGM');
    await expect(outTime).toHaveValue('5');
  });

  test('has number inputs for the width, the height and the X/Y position', async ({ page }) => {
    await expect(page.locator('cut-in-editor input[name="cut-in-width"]')).toBeAttached();
    await expect(page.locator('cut-in-editor input[name="cut-in-height"]')).toBeAttached();
    await expect(page.locator('cut-in-editor input[name="cut-in-x-pos-num"]')).toBeAttached();
    await expect(page.locator('cut-in-editor input[name="cut-in-y-pos-num"]')).toBeAttached();
  });

  test('has the checkboxes for keeping the aspect ratio, looping, treating it as a video and starting it from the chat', async ({
    page,
  }) => {
    await expect(page.locator('cut-in-editor input[name="keepImageAspect"]')).toBeAttached();
    await expect(page.locator('cut-in-editor input[name="cutInIsLoop"]')).toBeAttached();
    await expect(page.locator('cut-in-editor input[name="cutInIsVideo"]')).toBeAttached();
    await expect(page.locator('cut-in-editor input[name="chatActivate"]')).toBeAttached();
  });

  test('toggles the flag by turning "treat as a video" on and off', async ({ page }) => {
    const cb = page.locator('cut-in-editor input[name="cutInIsVideo"]');
    const initialChecked = await cb.isChecked();
    await cb.click({ force: true });
    if (initialChecked) {
      await expect(cb).not.toBeChecked();
    } else {
      await expect(cb).toBeChecked();
    }
  });
});
