import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** Says a line from the chat input, pressing it first so the chat window comes over the panels it overlaps. */
async function say(page: Page, text: string) {
  const textarea = page.locator('textarea.chat-input');
  await textarea.click();
  await textarea.fill(text);
  await textarea.press('Enter');
  await expect(textarea).toHaveValue('');
}

function lineSaying(page: Page, text: string): Locator {
  return page.locator('chat-tab chat-message').filter({ hasText: text });
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

test.describe('チャットのスタンプとリアクション', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('入力欄が空のまま選んだスタンプは、スタンプだけの発言になること', async ({ page }) => {
    await page.getByTestId('chat-input-stamp').click();
    await pickStamp(page, 'seal:ok');

    const stampLines = page.locator('chat-tab chat-message').filter({ has: page.getByTestId('chat-message-stamp') });
    await expect(stampLines).toHaveCount(1);
    await expect(stampLines.getByTestId('chat-message-stamp').locator('[data-stamp-id="seal:ok"]')).toBeVisible();
    await expect(stampLines.getByTestId('chat-message-said-with-stamp')).toHaveCount(0);
    await expect(stampLines).not.toContainText('［了解］');
  });

  test('文を入力したまま選んだスタンプは、その文と一緒に1つの発言になること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('今のは見逃せない');
    await page.getByTestId('chat-input-stamp').click();
    await pickStamp(page, 'sfx:shock');

    await expect(textarea).toHaveValue('');
    const line = lineSaying(page, '今のは見逃せない');
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('chat-message-said-with-stamp')).toHaveText('今のは見逃せない');
    await expect(line.getByTestId('chat-message-stamp').locator('[data-stamp-id="sfx:shock"]')).toBeVisible();
    await expect(line).not.toContainText('［ガーン］');
    await expect(
      page.locator('chat-tab chat-message').filter({ has: page.getByTestId('chat-message-stamp') })
    ).toHaveCount(1);
  });

  test('ツールバーから付けたリアクションは自分の1件として押された状態で並び、もう一度押すと外れること', async ({
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

  test('GM が部屋設定でスタンプの発言を切ると入力欄のスタンプボタンが消え、戻すと出ること', async ({ page }) => {
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

  test('リアクションで止めたスタンプはリアクションの一覧から消え、発言用の一覧には残ること', async ({ page }) => {
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
