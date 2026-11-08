import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, expectChatText, openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

function pieceOf(page: Page, name: string): Locator {
  return page.locator('game-character').filter({ hasText: name }).first();
}

function bubbleOver(page: Page, name: string): Locator {
  return pieceOf(page, name).getByTestId('speech-bubble');
}

async function speakAs(page: Page, name: string, line: string) {
  const from = page.locator('chat-window .chat-select--from');
  const chosen = from.locator('.ng-value-label');
  if ((await chosen.textContent())?.trim() !== name) {
    // Typed rather than clicked: a settings panel may lie over the chat window.
    const search = from.locator('input[role="combobox"]');
    await search.fill(name);
    await expect(page.locator('.ng-dropdown-panel').getByRole('option', { name, exact: true })).toBeVisible();
    await search.press('Enter');
    await expect(chosen).toHaveText(name);
  }
  const textarea = chatInput(page);
  await textarea.fill(line);
  await textarea.press('Enter');
  await expectChatText(textarea, '');
}

/** A character's line comes up in a bubble over its piece on the table. */
test.describe('speech bubbles over a character’s lines', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(pieceOf(page, 'キャラクターA')).toBeAttached({ timeout: 10000 });
  });

  test('shows only the words inside 「」 over the speaking character’s piece, for a line that has them', async ({
    page,
  }) => {
    await speakAs(page, 'キャラクターA', '「この先の吊り橋はもう長くはもたないだろう」と彼は肩をすくめた');

    const bubble = bubbleOver(page, 'キャラクターA');
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveText('この先の吊り橋はもう長くはもたないだろう');
    await expect(page.getByTestId('speech-bubble')).toHaveCount(1);
  });
});

/** A shared note can be drawn with headings and lists read from the marks at the start of its lines. */
test.describe('formatted shared notes', () => {
  test('draws headings and lists when formatted, and the text as written once back to plain', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '共有メモを作成')).click();
    const note = page.locator('text-note').first();
    await expect(note).toBeAttached({ timeout: 10000 });

    await note.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('メモを編集').click();
    const sheet = page.locator('game-character-sheet');
    await sheet.locator('label').filter({ hasText: '本文' }).locator('textarea').fill('# 見出し\n- 項目');
    await expect(note).toContainText('# 見出し');

    await sheet.getByTestId('text-note-format-formatted').click();
    await expect(sheet.getByTestId('text-note-format-formatted')).toHaveAttribute('aria-checked', 'true');
    await expect(note.locator('.note-formatted h1')).toHaveText('見出し');
    await expect(note.locator('.note-formatted li')).toHaveText('項目');
    await expect(note).not.toContainText('# 見出し');

    await sheet.getByTestId('text-note-format-plain').click();
    await expect(note.locator('.note-formatted')).toHaveCount(0);
    await expect(note.locator('h1, li')).toHaveCount(0);
    await expect(note).toContainText('# 見出し');
    await expect(note).toContainText('- 項目');
  });
});
