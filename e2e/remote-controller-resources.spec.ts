import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** The game master picks, in the room settings, which values and resources the remote controllers show. */
test.describe('リモコンに出す数値とリソース', () => {
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

  test('部屋設定で外した項目は、リモコンのリソース操作にもコマの欄にも出ないこと', async ({ page }) => {
    await waitAppReady(page);
    await becomeGameMaster(page);
    await openPanel(page, '部屋設定');
    const section = page.getByTestId('room-settings-controller-resources');
    await expect(section.locator('input[data-resource="器用度"]')).toBeChecked();

    // パネルが重なって開くことがあるので、チェックへは直接押下を送る。
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

  test('PL は部屋設定のこの欄に触れないこと', async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, '部屋設定');
    const section = page.getByTestId('room-settings-controller-resources');
    await expect(section.locator('input[data-resource="HP"]')).toBeAttached();

    // GM だけが変えられる欄なので、PL には操作の届かない形で出る。
    expect(await section.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
  });
});
