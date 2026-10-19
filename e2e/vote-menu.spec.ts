import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('the roll call and vote menu (vote-menu)', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await page.locator('chat-window button[title="点呼・投票"]').click();
    await expect(page.locator('app-vote-menu')).toBeVisible({ timeout: 5000 });
  });

  test('starts in "roll call" mode (vm_type=rollcall)', async ({ page }) => {
    const radios = page.locator('app-vote-menu input[name="vm_type"]');
    await expect(radios.nth(0)).toBeChecked();
  });

  test('shows the title and choices fields on switching to the "vote" radio', async ({ page }) => {
    const radios = page.locator('app-vote-menu input[name="vm_type"]');
    await radios.nth(1).check();
    await expect(page.locator('app-vote-menu input[name="voteTitle"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('app-vote-menu input[name="voteContents"]')).toBeVisible();
  });

  test('takes a title and choices in "vote" mode', async ({ page }) => {
    const radios = page.locator('app-vote-menu input[name="vm_type"]');
    await radios.nth(1).check();
    const title = page.locator('app-vote-menu input[name="voteTitle"]');
    const choices = page.locator('app-vote-menu input[name="voteContents"]');
    await title.fill('夜長テスト');
    await choices.fill('はい いいえ 棄権');
    await expect(title).toHaveValue('夜長テスト');
    await expect(choices).toHaveValue('はい いいえ 棄権');
  });

  test('disables the send button once includSelf is unchecked, with one alone in the room', async ({ page }) => {
    const includeSelf = page.locator('app-vote-menu input[name="includSelf"]');
    await includeSelf.uncheck();
    const sendBtn = page.locator('app-vote-menu').getByRole('button', { name: /送信/ });
    await expect(sendBtn).toBeDisabled();
  });

  test('shows the note for being alone in the room', async ({ page }) => {
    await expect(page.locator('app-vote-menu').getByText('自分しか部屋にいません')).toBeVisible();
  });

  test('hides the counts of a vote that hides its answers until it closes, and writes only that someone answered to the chat', async ({
    page,
  }) => {
    const menu = page.locator('app-vote-menu');
    await menu.locator('input[name="vm_type"]').nth(1).check();
    await menu.locator('input[name="voteTitle"]').fill('方針');
    await menu.locator('input[name="voteContents"]').fill('賛成 反対');
    await page.getByTestId('vote-menu-secret').check();
    await menu.locator('input[name="includSelf"]').check();
    await menu.getByRole('button', { name: /送信/ }).click();

    const widget = page.getByTestId('vote-widget');
    await expect(widget.getByTestId('vote-widget-secret')).toBeVisible({ timeout: 5000 });
    await expect(widget.getByTestId('vote-widget-choice-count')).toHaveCount(0);

    await widget.getByRole('button', { name: '賛成' }).click();
    const chat = page.locator('chat-window');
    await expect(chat.getByText(/回答しました\(1\/1\)/)).toBeVisible({ timeout: 5000 });
    await expect(chat.getByText(/投票：賛成/)).toHaveCount(0);
  });
});
