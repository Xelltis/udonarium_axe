import { expect, test } from '@playwright/test';

import { createCharacter, expectChatText, waitAppReady } from './helpers';

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

  test('has its own chat-input and the headings and character info buttons in the palette', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await expect(palette.locator('chat-input')).toBeVisible();
    await expect(palette.getByRole('button', { name: /見出し/ })).toBeVisible();
    await expect(palette.getByRole('button', { name: /キャラ情報/ })).toBeVisible();
  });

  test('switches the view on "character info" and offers "back to the palette"', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: /キャラ情報/ }).click();
    await expect(palette.getByRole('button', { name: /パレットに戻る/ })).toBeVisible({ timeout: 3000 });
  });

  test('shows the "editing" label once switched to edit mode', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    await expect(palette.getByText('編集中')).toBeVisible({ timeout: 3000 });
    await expect(palette.locator('[data-chat-palette-editor] [data-chat-palette-text]')).toBeVisible();
  });

  test('moves to the next tab when the wheel is turned over the tabs, as the chat window does', async ({ page }) => {
    const palette = page.locator('chat-palette');
    const pills = palette.locator('.chat-tab-pill');
    await expect(pills.nth(1)).toBeVisible();
    const checkedName = () =>
      palette.locator('input[name^="chat-tab"]:checked').evaluate((input) => input.parentElement!.textContent!.trim());
    const first = await checkedName();

    // The palette opens where the right click was and can sit under the toolbar, so the wheel is
    // sent straight to the strip of tabs.
    await pills
      .first()
      .evaluate((pill) =>
        pill.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
      );

    await expect.poll(checkedName).not.toBe(first);
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
      const nameInput = sheet.getByPlaceholder(/立ち絵名/);
      await nameInput.fill(name);
      await nameInput.press('Enter');
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

  test('lets another tab be opened after a jump to a heading picked from the menu', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    const editor = palette.locator('[data-chat-palette-editor] [data-chat-palette-text]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await editor.fill('1d100 目星\n◆◆戦闘\n◆攻撃\n2d6+3 攻撃\n◆◆探索\nCC<=50');
    await expectChatText(editor, '1d100 目星\n◆◆戦闘\n◆攻撃\n2d6+3 攻撃\n◆◆探索\nCC<=50');
    await palette.getByRole('button', { name: '確定', exact: true }).click();
    const tab = (name: string) => palette.getByTestId('palette-tab').filter({ hasText: name });
    const line = (text: string) => palette.locator('[data-line]').filter({ hasText: text });

    await tab('戦闘').click();
    await palette.getByTestId('palette-headings-menu').click();
    await page.locator('context-menu').getByText('攻撃').click();
    await expect(line('2d6+3 攻撃')).toBeVisible();

    await tab('探索').click();
    await expect(tab('探索')).toHaveAttribute('aria-selected', 'true');
    await expect(line('CC<=50')).toBeVisible();
    await tab('メイン').click();
    await expect(line('1d100 目星')).toBeVisible();
    await expect(line('2d6+3 攻撃')).toHaveCount(0);
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
});

test.describe('the chat colour settings modal', () => {
  test('opens chat-color-setting from the colour settings button', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('chat-input').getByTestId('chat-input-color').first().click();
    await page
      .locator('chat-input')
      .getByRole('button', { name: /色設定/ })
      .click();
    await expect(page.locator('chat-color-setting')).toBeVisible({ timeout: 5000 });
    // There is a colour picker for each colour being edited (name="chat-color-<number>").
    await expect(page.locator('chat-color-setting input[type="color"]').first()).toBeAttached();
  });
});
