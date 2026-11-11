import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, createCharacter, expectChatText, revealMenuEntry, waitAppReady } from './helpers';

/** Says each line into the chat window, waiting for the box to empty after each. */
async function say(page: Page, lines: string[]) {
  const input = chatInput(page).first();
  for (const line of lines) {
    await input.fill(line);
    await input.press('Enter');
    await expectChatText(input, '');
  }
}

/** The dice bot's answer to a roll, by the roll as it writes it. */
function answerTo(page: Page, roll: string): Locator {
  return page.locator('chat-tab chat-message').filter({ hasText: `(${roll})` });
}

/** What an answer came to: the last number its arrows lead to. */
async function totalOf(answer: Locator): Promise<number> {
  const text = (await answer.locator('.msg-text').innerText()).trim();
  const steps = text.split('→').map((step) => step.trim());
  return Number(steps.filter((step) => /^-?\d+$/.test(step)).at(-1));
}

/** Picks an entry from an answer's menu. */
async function fromMenuOf(page: Page, answer: Locator, entry: string) {
  await answer.locator('.msg-text').click({ button: 'right' });
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await (await revealMenuEntry(page, menu, entry, true)).click();
}

test.describe('the number to beat', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  /**
   * The bar over the box tells what `{目標値}` will be filled in with, and a result picked from it
   * fills in that one line, the next one going back to the one found. A result set as the tab's
   * number to beat then fills every `{目標値}` said in it, a roll of the reader's own among them,
   * until it is taken off.
   */
  test("fills {目標値} in with the result picked before sending, then with the result set as the tab's number to beat until it is taken off", async ({
    page,
  }) => {
    await say(page, ['2d6+8 火球', '1d6+100']);
    const fireball = answerTo(page, '2D6+8');
    await expect(fireball).toHaveCount(1, { timeout: 15000 });
    await expect(answerTo(page, '1D6+100')).toHaveCount(1, { timeout: 15000 });
    const total = await totalOf(fireball);

    const input = chatInput(page).first();
    await input.fill('2d6>={目標値} 抵抗');
    const bar = page.getByTestId('chat-input-target-number');
    await expect(bar).toBeVisible();
    const select = bar.getByTestId('chat-input-target-number-select');
    await expect(select.locator('option')).toHaveText([/見つかりません/, /1D6\+100/, /2D6\+8/]);
    await select.selectOption({ index: 2 });
    await input.press('Enter');
    await expectChatText(input, '');
    await expect(answerTo(page, `2D6>=${total}`)).toHaveCount(1, { timeout: 15000 });
    await expect(bar).toHaveCount(0);
    await input.fill('2d6>={目標値}');
    await expect(select).toHaveValue(/^0:/);

    await fromMenuOf(page, fireball, 'この結果を目標値にする');
    await expect(fireball.getByTestId('chat-message-target-number-mark')).toBeVisible();

    await say(page, ['2d6>={目標値} 抵抗']);
    await expect(answerTo(page, `2D6>=${total}`)).toHaveCount(2, { timeout: 15000 });

    await fromMenuOf(page, fireball, '目標値の固定を外す');
    await expect(fireball.getByTestId('chat-message-target-number-mark')).toHaveCount(0);
  });

  /**
   * A game master writes the number to beat out in so many words, and a piece speaking from its
   * palette fills its `{目標値}` in with it. A player's line writing one out is not taken of itself,
   * but may be set as the tab's number to beat from its menu.
   */
  test("fills {目標値} in with the number a game master wrote out, and with a player's once it is set as the tab's", async ({
    page,
  }) => {
    const seat = (role: 'GM' | 'PL') =>
      page
        .locator('ui-panel')
        .filter({ hasText: '接続情報' })
        .getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) })
        .click();
    await seat('GM');
    await say(page, ['探索判定：目標値13']);
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('チャットパレットを表示').click();
    const palette = page.locator('chat-palette');
    const box = chatInput(palette);
    const found = palette.getByTestId('chat-input-target-number-select').locator('option').first();

    await box.fill('2d6>={目標値} 探索');
    await expect(found).toHaveText(/13.*示した目標値/);
    await box.press('Enter');
    await expect(answerTo(page, '2D6>=13')).toHaveCount(1, { timeout: 15000 });

    await seat('PL');
    await say(page, ['見識判定：目標値15']);
    await box.fill('2d6>={目標値} 見識');
    await expect(found).toHaveText(/13/);
    await fromMenuOf(
      page,
      page.locator('chat-tab chat-message').filter({ hasText: '見識判定：目標値15' }),
      'この目標値を固定する'
    );
    await expect(found).toHaveText(/15.*固定/);
    await box.press('Enter');
    await expect(answerTo(page, '2D6>=15')).toHaveCount(1, { timeout: 15000 });
  });
});
