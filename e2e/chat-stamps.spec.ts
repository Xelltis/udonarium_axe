import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, chatInputText, expectChatText, openPanel, waitAppReady } from './helpers';

/** Says a line from the chat input, pressing it first so the chat window comes over the panels it overlaps. */
async function say(page: Page, text: string) {
  const textarea = chatInput(page);
  await textarea.click();
  await textarea.fill(text);
  await textarea.press('Enter');
  await expectChatText(textarea, '');
}

function lineSaying(page: Page, text: string): Locator {
  return page.locator('chat-tab chat-message').filter({ hasText: text });
}

function stampLines(page: Page): Locator {
  return page.locator('chat-tab chat-message').filter({ has: page.getByTestId('chat-message-stamp') });
}

/** Picks a stamp from the open picker, on the tab of its family. */
async function pickStamp(page: Page, stampId: string) {
  const picker = page.getByTestId('stamp-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId(`stamp-picker-tab-${stampId.split(':')[0]}`).click();
  await picker.getByTestId(`stamp-picker-choice-${stampId}`).click();
  await expect(picker).toHaveCount(0);
}

/** Opens the reaction picker from the toolbar over a line. */
async function openReactionPicker(page: Page, line: Locator): Promise<Locator> {
  await line.locator('.msg-text').hover();
  await line.getByTestId('chat-message-action-react').click();
  const picker = page.getByTestId('stamp-picker');
  await expect(picker).toBeVisible();
  return picker;
}

async function becomeGameMaster(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
}

async function openStampRules(page: Page) {
  await openPanel(page, '部屋設定');
  await page.getByTestId('room-settings-tab-stamp').click();
  await expect(page.getByTestId('room-settings-stamps-line')).toBeVisible();
}

function closeRoomSettings(page: Page) {
  return page
    .locator('ui-panel')
    .filter({ has: page.getByTestId('room-settings-stamps-line') })
    .locator('button', { hasText: /^close$/ })
    .dispatchEvent('click');
}

test.describe('chat stamps and reactions', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens the stamps over their button, sends the one picked alone as a large stamp with Enter, and draws a line of stamps alone large, side by side', async ({
    page,
  }) => {
    const input = chatInput(page);
    const button = page.locator('chat-window [data-testid="chat-input-stamp"]');
    await button.click();
    await expect(page.getByTestId('stamp-picker')).toBeVisible();
    const buttonBox = (await button.boundingBox())!;
    const pickerBox = (await page.getByTestId('stamp-picker').boundingBox())!;
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(buttonBox.y + 1);
    await pickStamp(page, 'seal:ok');

    await expect(input.locator('[data-chip="stamp"][data-stamp-id="seal:ok"]')).toHaveCount(1);
    await expect(stampLines(page)).toHaveCount(0);

    await input.press('Enter');
    await expectChatText(input, '');
    await expect(stampLines(page)).toHaveCount(1);
    await expect(stampLines(page).getByTestId('chat-message-stamp').locator('[data-stamp-id="seal:ok"]')).toBeVisible();
    await expect(stampLines(page)).not.toContainText('［了解］');

    for (const stampId of ['seal:ok', 'sfx:shock']) {
      await button.click();
      await pickStamp(page, stampId);
    }
    await expect(input.locator('[data-chip="stamp"]')).toHaveCount(2);
    await input.press('Enter');
    await expectChatText(input, '');
    const pair = page
      .locator('chat-tab chat-message')
      .filter({ has: page.locator('[data-chat-search-text] [data-stamp-id="sfx:shock"]') })
      .locator('[data-chat-search-text] [data-stamp-id]');
    await expect(pair).toHaveCount(2);
    expect((await pair.last().boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test('puts the stamp picked in at the caret, sending it small inside the words', async ({ page }) => {
    const input = chatInput(page);
    await input.click();
    await page.keyboard.type('今のは見逃せない');
    await expectChatText(input, '今のは見逃せない');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.locator('chat-window [data-testid="chat-input-stamp"]').click();
    await pickStamp(page, 'sfx:shock');
    await expect.poll(() => chatInputText(input)).toMatch(/^今の［.+:sfx:shock］は見逃せない$/);

    await input.press('Enter');
    await expectChatText(input, '');
    const line = lineSaying(page, '見逃せない');
    await expect(line).toHaveCount(1);
    const drawn = line.locator('[data-chat-search-text] [data-stamp-id="sfx:shock"]');
    await expect(drawn).toBeVisible();
    expect((await drawn.boundingBox())!.height).toBeLessThan(32);
    await expect(line.getByTestId('chat-message-stamp')).toHaveCount(0);
  });

  test('hides the stamp button of the input while the GM turns stamp lines off, and leaves a stamp stopped for reactions out of the reaction list, keeping it in the list for lines', async ({
    page,
  }) => {
    await becomeGameMaster(page);
    const stampButton = page.getByTestId('chat-input-stamp');
    await expect(stampButton).toBeVisible();
    await openStampRules(page);
    const lineOn = page.getByTestId('room-settings-stamps-line-on');
    await expect(lineOn).toBeChecked();
    await lineOn.uncheck();
    await expect(lineOn).not.toBeChecked();
    await expect(stampButton).toHaveCount(0);
    await lineOn.check();
    await expect(lineOn).toBeChecked();
    await expect(stampButton).toBeVisible();

    const reactionRules = page.getByTestId('room-settings-stamps-reaction');
    await reactionRules.locator('summary', { hasText: '判子' }).click();
    const denied = reactionRules.getByTestId('room-settings-stamp-reaction-seal:god');
    await expect(denied).toHaveAttribute('aria-pressed', 'true');
    await denied.click();
    await expect(denied).toHaveAttribute('aria-pressed', 'false');
    await closeRoomSettings(page);

    await say(page, '神引きだった');
    const picker = await openReactionPicker(page, lineSaying(page, '神引きだった'));
    await picker.getByTestId('stamp-picker-tab-seal').click();
    await expect(picker.getByTestId('stamp-picker-choice-seal:ok')).toBeVisible();
    await expect(picker.getByTestId('stamp-picker-choice-seal:god')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);

    await page.getByTestId('chat-input-stamp').click();
    const linePicker = page.getByTestId('stamp-picker');
    await linePicker.getByTestId('stamp-picker-tab-seal').click();
    await expect(linePicker.getByTestId('stamp-picker-choice-seal:god')).toBeVisible();
  });
});
