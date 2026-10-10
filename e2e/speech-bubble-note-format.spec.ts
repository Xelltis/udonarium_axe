import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, openTableContextMenu, waitAppReady } from './helpers';

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
  const textarea = page.locator('textarea.chat-input');
  await textarea.fill(line);
  await textarea.press('Enter');
  await expect(textarea).toHaveValue('');
}

/** A character's line comes up in a bubble over its piece on the table. */
test.describe('キャラクターの発言の吹き出し', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(pieceOf(page, 'キャラクターA')).toBeAttached({ timeout: 10000 });
  });

  test('「」のある発言は、かぎかっこの中の言葉だけが発言したキャラクターのコマの上に出ること', async ({ page }) => {
    await speakAs(page, 'キャラクターA', '「この先の吊り橋はもう長くはもたないだろう」と彼は肩をすくめた');

    const bubble = bubbleOver(page, 'キャラクターA');
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveText('この先の吊り橋はもう長くはもたないだろう');
    await expect(page.getByTestId('speech-bubble')).toHaveCount(1);
  });

  test('ダイスボットが答えたロールの発言には吹き出しが出ないこと', async ({ page }) => {
    const answers = page.locator('chat-tab .dicebot-message');
    const before = await answers.count();
    await speakAs(page, 'キャラクターA', '2d6');
    await expect(answers).toHaveCount(before + 1, { timeout: 15000 });

    // A later line's bubble comes up only after the roll's own wait has run out, and a bubble left
    // from the roll would still be up then: it is counted once, as a retried count would outlast it.
    await speakAs(page, 'キャラクターB', '「次は私の番だ、よく見ていてくれ」');
    await expect(bubbleOver(page, 'キャラクターB')).toHaveText('次は私の番だ、よく見ていてくれ');
    expect(await bubbleOver(page, 'キャラクターA').count()).toBe(0);
  });

  test('ツールバーの切り替えで、この画面の吹き出しを隠して戻せること', async ({ page }) => {
    await speakAs(page, 'キャラクターA', '「足もとに気をつけて、ここから先は床がひどく傷んでいるぞ」');
    const bubble = bubbleOver(page, 'キャラクターA');
    await expect(bubble).toBeVisible();

    const toggle = page.locator('app-pl-toolbar').getByTestId('toolbar-speech');
    await toggle.click();
    await expect(page.getByTestId('speech-bubble')).toHaveCount(0);

    await toggle.click();
    await expect(bubble).toHaveText('足もとに気をつけて、ここから先は床がひどく傷んでいるぞ');
  });

  test('GM が部屋設定で吹き出しを切ると、その間の発言には吹き出しが出ないこと', async ({ page }) => {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
    await openPanel(page, '部屋設定');
    const section = page.getByTestId('room-settings-speech-bubbles');
    const roomSwitch = section.locator('input[type="checkbox"]');
    await expect(roomSwitch).toBeChecked();

    await section.locator('label:has(input[type="checkbox"])').dispatchEvent('click');
    await expect(roomSwitch).not.toBeChecked();
    await speakAs(page, 'キャラクターA', '「誰にも聞こえないように、ここだけの話をしよう」');
    await expect(page.locator('chat-tab chat-message').filter({ hasText: 'ここだけの話をしよう' })).toBeVisible();

    await section.locator('label:has(input[type="checkbox"])').dispatchEvent('click');
    await expect(roomSwitch).toBeChecked();
    await speakAs(page, 'キャラクターB', '「今度はみんなに聞こえるように話そう」');
    await expect(bubbleOver(page, 'キャラクターB')).toHaveText('今度はみんなに聞こえるように話そう');
    expect(await bubbleOver(page, 'キャラクターA').count()).toBe(0);
  });
});

/** A shared note can be drawn with headings and lists read from the marks at the start of its lines. */
test.describe('共有メモの整形表示', () => {
  test('整形にすると見出しとリストとして描かれ、通常に戻すと書いたままの文字で出ること', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openTableContextMenu(page);
    await menu.getByText('共有メモを作成').click();
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
