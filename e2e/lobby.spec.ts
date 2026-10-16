import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/**
 * The connection panel is where every session starts, and it had no coverage.
 * The suite runs against a backend that answers nothing on purpose, so this
 * stops at what the browser owns: the panel's own controls, and the lobby
 * reporting honestly that it is not connected rather than hanging or blanking.
 */
test.describe('the connection panel and the lobby', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('peer-menu')).toBeVisible({ timeout: 10000 });
  });

  test('shows a changed nickname as the speaker name in the chat', async ({ page }) => {
    const nickname = page.locator('peer-menu input[name="peer-name"]');
    await expect(nickname).toBeVisible();
    await nickname.fill('語り部');

    // The speaker picker shows one's own name followed by 「（あなた）」.
    await expect(page.locator('chat-input')).toContainText('語り部', { timeout: 10000 });
  });

  test('turns "show details" on and off', async ({ page }) => {
    const detail = page.locator('peer-menu input[name="disp-detail-flag"]');
    await expect(detail).not.toBeChecked();

    // The chat window opened at start-up covers the lower part of the panel, so the event is sent directly.
    // What it shows is each other peer's latency, and with a backend that answers nothing there is none.
    await detail.dispatchEvent('click');
    await expect(detail).toBeChecked();
    await detail.dispatchEvent('click');
    await expect(detail).not.toBeChecked();
  });

  test('says plainly that it is not connected when the backend answers nothing', async ({ page }) => {
    await page
      .locator('peer-menu')
      .getByRole('button', { name: /ロビー/ })
      .dispatchEvent('click');

    const lobby = page.locator('lobby');
    await expect(lobby).toBeVisible({ timeout: 15000 });
    // Rather than going blank, or saying there are no rooms, it says it is not connected yet.
    await expect(lobby).toContainText('まだサーバーにつながっていません');
    await expect(lobby.getByRole('button', { name: /新しいルームを作成する/ })).toBeVisible();
    await expect(lobby.getByRole('button', { name: /一覧を更新/ })).toBeVisible();
  });

  test('opens the room creation form from the lobby', async ({ page }) => {
    await page
      .locator('peer-menu')
      .getByRole('button', { name: /ロビー/ })
      .dispatchEvent('click');
    await expect(page.locator('lobby')).toBeVisible({ timeout: 15000 });

    await page
      .locator('lobby')
      .getByRole('button', { name: /新しいルームを作成する/ })
      .click();
    await expect(page.locator('room-setting')).toBeVisible({ timeout: 10000 });
  });

  test('lets a user switch their own role, with the toolbars following', async ({ page }) => {
    const roles = page.locator('peer-menu');
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });

    await roles.getByRole('button', { name: /^\s*見学\s*$/ }).click();
    // A guest is read-only, so neither toolbar shows.
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toHaveCount(0);

    await roles.getByRole('button', { name: /^\s*PL\s*$/ }).click();
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
  });
});
