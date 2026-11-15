import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, createCharacter, expectChatText, revealMenuEntry, sendMenuEvent, waitAppReady } from './helpers';

function piece(page: Page): Locator {
  return page.locator('game-character').filter({ hasText: '新しいキャラクター' }).first();
}

/**
 * Opens the piece's menu and presses an entry of it. The piece stands under the windows the spec has
 * opened, where no click reaches it, so the menu is asked for without a press.
 */
async function fromPieceMenu(page: Page, name: string): Promise<void> {
  await sendMenuEvent(piece(page));
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await (await revealMenuEntry(page, menu, name, true)).click();
}

/** Says lines as the piece, from its chat palette, each sent before the next is written. */
async function sayAsPiece(page: Page, lines: readonly string[]): Promise<void> {
  const input = chatInput(page.locator('chat-palette')).first();
  for (const line of lines) {
    await input.fill(line);
    await input.press('Enter');
    await expectChatText(input, '');
  }
}

const gauges = (page: Page) => piece(page).locator('[data-testid="piece-gauge"]');
const badges = (page: Page) => piece(page).locator('[data-testid="buff-badge"]');
const reportOf = (page: Page, text: string) => page.locator('chat-message').filter({ hasText: text });

/** Waits for the piece to stand at these amounts of HP and MP, as the bars over it tell them. */
async function expectResources(page: Page, hp: string, mp: string): Promise<void> {
  await expect(gauges(page).first()).toContainText(hp, { timeout: 10000 });
  await expect(gauges(page).nth(1)).toContainText(mp, { timeout: 10000 });
}

/**
 * A table keeps the values a piece starts a fight with, lays buffs and moves values through the
 * fight, and puts all of it back in one line of chat once the fight is over.
 */
test.describe('putting a piece back as it was before a fight', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await fromPieceMenu(page, '詳細を表示');
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await sheet.getByTestId('sheet-capture-defaults').dispatchEvent('click');
    await page.locator('confirm-dialog').getByRole('button', { name: 'OK' }).click();
    await expect(page.locator('confirm-dialog')).toHaveCount(0);

    await fromPieceMenu(page, 'チャットパレットを表示');
    await expect(page.locator('chat-palette')).toBeVisible({ timeout: 10000 });
    // A buff, a debuff, a buff that moves a status as it goes on, and a value moved by hand.
    await sayAsPiece(page, ['&盾/防御+1/3', '&呪い/命中-1/3/デバフ', '&!消耗/MP/-/30/3', ':HP-50']);
    await expectResources(page, '150/200', '70/100');
    await expect(badges(page)).toHaveCount(3, { timeout: 10000 });
    await expect(badges(page).locator('[data-testid="buff-debuff-mark"]')).toHaveCount(1);
  });

  test('clears the buffs and puts the values back with &リセット-, and takes that back with 元に戻す', async ({
    page,
  }) => {
    const sheet = page.locator('game-character-sheet');
    await expect(sheet.getByTestId('default-mark')).toHaveCount(2);

    await sayAsPiece(page, ['&リセット-']);

    const report = reportOf(page, 'すべてのバフを解除（3件）');
    await expect(report).toHaveCount(1, { timeout: 10000 });
    await expect(report).toContainText('既定値に戻す');
    await expectResources(page, '200/200', '100/100');
    await expect(badges(page)).toHaveCount(0);
    await expect(sheet.getByTestId('default-mark')).toHaveCount(0);

    // The chat window may lie under the palette and the sheet, so the press is sent to the button directly.
    await report.getByTestId('reset-undo').dispatchEvent('click');

    await expectResources(page, '150/200', '70/100');
    await expect(badges(page)).toHaveCount(3);
    await expect(badges(page).locator('[data-testid="buff-debuff-mark"]')).toHaveCount(1);
    await expect(report.getByTestId('reset-undo')).toHaveCount(0);
    await expect(report.getByTestId('reset-undo-result')).toContainText('1体を戻しました');
    await expect(reportOf(page, 'リセットを元に戻しました')).toHaveCount(1);

    // Taking the buff that moved MP off afterwards gives back what it moved, once.
    await sayAsPiece(page, ['&消耗-']);
    await expectResources(page, '150/200', '100/100');
  });

  test('resets the piece from its menu, once the reader has confirmed it', async ({ page }) => {
    await fromPieceMenu(page, 'デバフだけ外す');
    await page.locator('confirm-dialog').getByRole('button', { name: 'OK' }).click();
    await expect(badges(page)).toHaveCount(2, { timeout: 10000 });
    await expect(badges(page).locator('[data-testid="buff-debuff-mark"]')).toHaveCount(0);
    await expectResources(page, '150/200', '70/100');

    await fromPieceMenu(page, 'すべてリセット');
    await page.locator('confirm-dialog').getByRole('button', { name: 'OK' }).click();

    await expect(badges(page)).toHaveCount(0, { timeout: 10000 });
    await expectResources(page, '200/200', '100/100');
    const report = reportOf(page, 'リセットしました（バフ2件');
    await expect(report).toHaveCount(1);

    // With nothing left to reset, the menu offers none of the resets.
    await sendMenuEvent(piece(page));
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('バフ・演出', { exact: true }).first().hover();
    await expect(menu.getByText('バフ編集', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('すべてリセット', { exact: true })).toHaveCount(0);
  });
});
