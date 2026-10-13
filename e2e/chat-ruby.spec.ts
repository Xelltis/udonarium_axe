import { expect, Page, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

async function say(page: Page, line: string) {
  const textarea = page.locator('textarea.chat-input');
  await textarea.fill(line);
  await textarea.press('Enter');
  await expect(textarea).toHaveValue('');
}

async function chooseRuby(page: Page, part: string, value: string) {
  await page.locator(`chat-message-setting select[name="ruby-${part}"]`).selectOption(value);
}

test.describe('ルビ', () => {
  test('グループルビとモノルビを振り分け、読み手の設定で割り付け・位置・振り方が変わること', async ({ page }) => {
    await waitAppReady(page);
    await say(page, '|一二三四五《あい》と|漢字《かん|じ》');
    const message = page.locator('chat-tab chat-message').filter({ hasText: '一二三四五' });
    const rubies = message.locator('ruby.chat-ruby');
    await expect(rubies).toHaveCount(2);
    await expect(rubies.nth(1).locator('rb')).toHaveText(['漢', '字']);
    await expect(rubies.nth(1).locator('rt')).toHaveText(['かん', 'じ']);
    const align = () => rubies.first().evaluate((ruby) => getComputedStyle(ruby).getPropertyValue('ruby-align'));
    expect(await align()).toBe('space-around');

    await openChatSettingsMenuItem(page, 'チャット設定');
    await expect(page.getByTestId('chat-ruby-settings')).toBeVisible({ timeout: 10000 });
    await chooseRuby(page, 'spacing', 'tight');
    await expect.poll(align, { timeout: 5000 }).toBe('center');
    await chooseRuby(page, 'align', 'start');
    await expect.poll(align, { timeout: 5000 }).toBe('start');

    await chooseRuby(page, 'show', 'brackets');
    const reading = rubies.first().locator('rt');
    await expect.poll(() => reading.evaluate((rt) => getComputedStyle(rt).display), { timeout: 5000 }).toBe('inline');
    expect(await reading.evaluate((rt) => getComputedStyle(rt, '::before').content)).toBe('"（"');

    await chooseRuby(page, 'show', 'hidden');
    await expect.poll(() => reading.evaluate((rt) => getComputedStyle(rt).display), { timeout: 5000 }).toBe('none');
  });
});
