import { expect, test } from '@playwright/test';

import { chatInput, createCharacter, expectChatText, waitAppReady } from './helpers';

async function openChatPalette(page: import('@playwright/test').Page) {
  await waitAppReady(page);
  await createCharacter(page);
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  await page.locator('context-menu').getByText('チャットパレットを表示').click();
  await expect(page.locator('chat-palette')).toBeVisible({ timeout: 10000 });
}

test.describe('the chat palette', () => {
  test.beforeEach(async ({ page }) => {
    await openChatPalette(page);
  });

  test("switches among the portraits of a piece with several from the palette's portrait, reading their names", async ({
    page,
  }) => {
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    const add = sheet.locator('button[title="立ち絵を追加"]');
    for (const pick of [1, 2]) {
      await add.click();
      await page.locator('modal img').nth(pick).click();
    }
    const thumbs = add.locator('xpath=..').locator('> div');
    await expect(thumbs).toHaveCount(3);
    for (const [index, name] of ['通常', '怒り', 'ひらめき'].entries()) {
      await thumbs.nth(index).click();
      await expect(thumbs.nth(index).getByText('person_pin')).toBeVisible();
      const nameInput = sheet.getByPlaceholder(/立ち絵名/);
      await nameInput.fill(name);
      await nameInput.press('Enter');
      await expect(thumbs.nth(index)).toHaveAttribute('title', name);
    }

    const picker = page.locator('chat-palette portrait-picker');
    const label = picker.locator('button[aria-haspopup="listbox"]');
    await expect(label).toHaveText('通常');
    // A four-character name has room to be read without being cut short.
    expect((await label.boundingBox())!.width).toBeGreaterThanOrEqual(40);

    // The sheet opens over the palette, so the press is sent to the button directly.
    await picker.getByRole('button', { name: '次の立ち絵' }).dispatchEvent('click');
    await expect(label).toHaveText('怒り');

    await label.dispatchEvent('click');
    await page.locator('chat-palette [popover]').getByRole('option', { name: 'ひらめき' }).dispatchEvent('click');
    await expect(label).toHaveText('ひらめき');
  });

  test('puts the search box above the list, and the results right under the search box', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByTestId('palette-search').fill('判定');
    await expect(palette.getByTestId('palette-search-results')).toBeVisible();

    // The panel moves as it opens, so the three positions are measured at once.
    const edges = await palette.evaluate((root) => {
      const rectOf = (selector: string) => root.querySelector(selector)!.getBoundingClientRect();
      return {
        searchBottom: rectOf('[data-testid="palette-search"]').bottom,
        resultsTop: rectOf('[data-testid="palette-search-results"]').top,
        firstLineTop: rectOf('[data-line]').top,
      };
    });
    expect(edges.resultsTop).toBeGreaterThanOrEqual(edges.searchBottom);
    expect(edges.resultsTop).toBeLessThan(edges.firstLineTop);
  });

  /**
   * A palette some of whose lines hold `{目標値}` keeps the room of the bar telling what it comes to
   * from the start, so the first click of a double click on such a line moves nothing under the
   * pointer and the second lands on the same line, sending it.
   */
  test('holds the list still as a line of two lines or one longer than the box is picked into it', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    const editor = palette.locator('[data-chat-palette-editor] .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    const long = `長い行${'あ'.repeat(90)}`;
    await editor.fill(`2d6 攻撃\\n命中したら追加\n${long}\n2d6+2 回避`);
    await palette.getByRole('button', { name: '確定' }).click();

    const list = palette.getByTestId('chat-palette-list');
    const last = list.getByText('2d6+2 回避');
    await expect(last).toBeVisible();
    const before = (await last.boundingBox())!.y;
    const input = chatInput(palette);
    for (const [picked, text] of [
      [list.getByText('2d6 攻撃'), '2d6 攻撃\n命中したら追加'],
      [list.getByText('長い行'), long],
    ] as const) {
      await picked.click();
      await expectChatText(input, text);
      expect(Math.abs((await last.boundingBox())!.y - before)).toBeLessThan(1);
    }

    // Typed over several lines, the box grows; a line picked into it then leaves the list where it
    // stood, so a double click on it sends it rather than landing on another.
    await input.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(`打った行${'い'.repeat(90)}`);
    const grown = (await last.boundingBox())!.y;
    expect(grown).toBeGreaterThan(before);
    await last.click();
    await expectChatText(input, '2d6+2 回避');
    expect(Math.abs((await last.boundingBox())!.y - grown)).toBeLessThan(1);
    await last.dblclick({ delay: 60 });
    await expect(page.locator('chat-tab chat-message').filter({ hasText: '(2D6+2)' })).toHaveCount(1, {
      timeout: 15000,
    });
    // Sent, the box is empty and one line tall again.
    await expect.poll(async () => Math.abs((await last.boundingBox())!.y - before)).toBeLessThan(1);
  });

  test('sends a line holding {目標値} on a double click, the list holding still as the bar fills', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    const editor = palette.locator('[data-chat-palette-editor] .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await editor.fill('2d6+1 命中\n2d6>={目標値} 抵抗\n2d6+2 回避');
    await expectChatText(editor, '2d6+1 命中\n2d6>={目標値} 抵抗\n2d6+2 回避');
    await palette.getByRole('button', { name: '確定' }).click();
    await expect(palette.getByTestId('chat-input-target-number-idle')).toBeVisible();

    // With nothing rolled yet the line is found wanting, and the mark saying so takes no more room.
    const line = palette.getByTestId('chat-palette-list').getByText('2d6>={目標値} 抵抗');
    const before = (await line.boundingBox())!.y;
    await line.click();
    await expect(palette.getByTestId('chat-input-findings')).toBeVisible({ timeout: 5000 });
    // The line typed in may sit a fraction of a pixel lower in the box than the hint did.
    expect(Math.abs((await line.boundingBox())!.y - before)).toBeLessThan(1);

    const input = chatInput(page).first();
    await input.fill('2d6+8 火球');
    await input.press('Enter');
    await expectChatText(input, '');
    const fireball = page.locator('chat-tab chat-message').filter({ hasText: '(2D6+8)' });
    await expect(fireball).toHaveCount(1, { timeout: 15000 });
    const text = (await fireball.locator('.msg-text').innerText()).trim();
    const total = text
      .split('→')
      .map((step) => step.trim())
      .filter((step) => /^-?\d+$/.test(step))
      .at(-1);

    // Each press held as a hand holds it, so that the page draws between the two clicks.
    await line.dblclick({ delay: 60 });
    await expect(page.locator('chat-tab chat-message').filter({ hasText: `(2D6>=${total})` })).toHaveCount(1, {
      timeout: 15000,
    });
    expect((await line.boundingBox())!.y).toBe(before);
  });
});
