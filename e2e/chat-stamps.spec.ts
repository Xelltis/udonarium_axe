import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, expectChatText, openPanel, waitAppReady } from './helpers';

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

  test('opens the stamps over their button, and puts the one picked under the words, sending it as a line of its own with Enter', async ({
    page,
  }) => {
    const input = chatInput(page);
    const button = page.getByTestId('chat-input-stamp');
    await button.click();
    await expect(page.getByTestId('stamp-picker')).toBeVisible();
    const buttonBox = (await button.boundingBox())!;
    const pickerBox = (await page.getByTestId('stamp-picker').boundingBox())!;
    expect(pickerBox.y + pickerBox.height).toBeLessThanOrEqual(buttonBox.y + 1);
    await pickStamp(page, 'seal:ok');

    const pending = page.getByTestId('chat-input-pending-stamp');
    await expect(pending.locator('[data-stamp-id="seal:ok"]')).toBeVisible();
    await expect(stampLines(page)).toHaveCount(0);

    await input.press('Enter');
    await expect(pending).toHaveCount(0);
    await expect(stampLines(page)).toHaveCount(1);
    await expect(stampLines(page).getByTestId('chat-message-stamp').locator('[data-stamp-id="seal:ok"]')).toBeVisible();
    await expect(stampLines(page).getByTestId('chat-message-said-with-stamp')).toHaveCount(0);
    await expect(stampLines(page)).not.toContainText('［了解］');
  });

  test('sends a stamp put under the words together with them as one line', async ({ page }) => {
    const input = chatInput(page);
    await input.fill('今のは見逃せない');
    await page.getByTestId('chat-input-stamp').click();
    await pickStamp(page, 'sfx:shock');

    await expectChatText(input, '今のは見逃せない');
    await expect(page.getByTestId('chat-input-pending-stamp').locator('[data-stamp-id="sfx:shock"]')).toBeVisible();
    await input.press('Enter');

    await expectChatText(input, '');
    await expect(page.getByTestId('chat-input-pending-stamp')).toHaveCount(0);
    const line = lineSaying(page, '今のは見逃せない');
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('chat-message-said-with-stamp')).toHaveText('今のは見逃せない');
    await expect(line.getByTestId('chat-message-stamp').locator('[data-stamp-id="sfx:shock"]')).toBeVisible();
    await expect(line).not.toContainText('［ガーン］');
    await expect(stampLines(page)).toHaveCount(1);
  });

  test('puts a second stamp picked in place of the first, and takes it away with its close button', async ({
    page,
  }) => {
    const input = chatInput(page);
    await page.getByTestId('chat-input-stamp').click();
    await pickStamp(page, 'seal:ok');
    await page.getByTestId('chat-input-stamp').click();
    await pickStamp(page, 'sfx:shock');

    const pending = page.getByTestId('chat-input-pending-stamp');
    await expect(pending.locator('[data-stamp-id]')).toHaveCount(1);
    await expect(pending.locator('[data-stamp-id="sfx:shock"]')).toBeVisible();

    await pending.getByRole('button', { name: 'スタンプを外す' }).click();
    await expect(pending).toHaveCount(0);
    await input.press('Enter');
    await expect(stampLines(page)).toHaveCount(0);
  });

  test('sends a stamp at once from the plain box', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('chat-preferences', JSON.stringify({ richInput: false })));
    await waitAppReady(page);
    await expect(page.locator('chat-window [data-chat-input-mode="plain"]')).toBeVisible();
    const textarea = chatInput(page);
    await textarea.fill('今のは見逃せない');
    await page.getByTestId('chat-input-stamp').click();
    await pickStamp(page, 'sfx:shock');

    await expectChatText(textarea, '');
    const line = lineSaying(page, '今のは見逃せない');
    await expect(line.getByTestId('chat-message-stamp').locator('[data-stamp-id="sfx:shock"]')).toBeVisible();
  });

  test("lists a reaction added from the toolbar as one's own, pressed, and removes it when pressed again", async ({
    page,
  }) => {
    await say(page, 'リアクションしてね');
    const line = lineSaying(page, 'リアクションしてね');

    await openReactionPicker(page, line);
    await pickStamp(page, 'seal:god');

    const chip = line.getByTestId('chat-message-reaction-seal:god');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip.locator('[data-reaction-count]')).toHaveText('1');

    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect(line.getByTestId('chat-message-reactions')).toHaveCount(0);
  });

  test('hides the stamp button of the input once the GM turns stamp lines off in the room settings, and shows it once they are back on', async ({
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
  });

  test('leaves a stamp stopped for reactions out of the reaction list, keeping it in the list for lines', async ({
    page,
  }) => {
    await becomeGameMaster(page);
    await openStampRules(page);
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
