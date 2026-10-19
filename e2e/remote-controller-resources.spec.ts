import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** The game master picks, in the room settings, which values and resources the remote controllers show. */
test.describe('the values and resources the remote controller shows', () => {
  async function becomeGameMaster(page: Page) {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
  }

  async function openRemote(page: Page) {
    await page.locator('game-character').filter({ hasText: 'キャラクターA' }).first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('リモコンを表示').click();
    const remote = page.locator('remote-controller');
    await expect(remote).toBeVisible({ timeout: 10000 });
    return remote;
  }

  test('keeps an item turned off in the room settings out of both the remote controller’s resource controls and the pieces’ columns', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGameMaster(page);
    await openPanel(page, '部屋設定');
    const section = page.getByTestId('room-settings-controller-resources');
    await expect(section.locator('input[data-resource="器用度"]')).toBeChecked();

    // Panels can open over one another, so the press is sent straight to the checkbox.
    await section.locator('label:has(input[data-resource="器用度"])').dispatchEvent('click');
    await expect(section.locator('input[data-resource="器用度"]')).not.toBeChecked();

    const remote = await openRemote(page);
    const choices = remote.locator('input[name="controller"]');
    await expect(choices.first()).toBeAttached();
    await expect(remote.locator('input[name="controller"][value="HP"]')).toBeAttached();
    await expect(remote.locator('input[name="controller"][value="器用度"]')).toHaveCount(0);
    await expect(remote).toContainText('HP');
    await expect(remote).not.toContainText('器用度');

    await section.getByTestId('controller-resources-show-all').dispatchEvent('click');

    await expect(remote.locator('input[name="controller"][value="器用度"]')).toBeAttached();
    await expect(remote).toContainText('器用度');
  });

  test('keeps a PL from touching this part of the room settings', async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, '部屋設定');
    const section = page.getByTestId('room-settings-controller-resources');
    await expect(section.locator('input[data-resource="HP"]')).toBeAttached();

    // Only the GM may change this part, so a PL sees it out of reach.
    expect(await section.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
  });
});
