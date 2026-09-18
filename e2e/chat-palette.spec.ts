import { expect, test } from '@playwright/test';

import { createCharacter, waitAppReady } from './helpers';

async function openChatPalette(page: import('@playwright/test').Page) {
  await waitAppReady(page);
  await createCharacter(page);
  await page.locator('game-character').first().dispatchEvent('contextmenu');
  await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  await page.locator('context-menu').getByText('チャットパレットを表示').click();
  await expect(page.locator('chat-palette')).toBeVisible({ timeout: 10000 });
}

test.describe('チャットパレット', () => {
  test.beforeEach(async ({ page }) => {
    await openChatPalette(page);
  });

  test('パレット内に独自の chat-input と「見出し」「キャラ情報」ボタンが存在すること', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await expect(palette.locator('chat-input')).toBeVisible();
    await expect(palette.getByRole('button', { name: /見出し/ })).toBeVisible();
    await expect(palette.getByRole('button', { name: /キャラ情報/ })).toBeVisible();
  });

  test('「キャラ情報」を押すとビューが切替わり、「パレットに戻る」が出ること', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: /キャラ情報/ }).click();
    await expect(palette.getByRole('button', { name: /パレットに戻る/ })).toBeVisible({ timeout: 3000 });
  });

  test('編集モードに切り替えると「編集中」ラベルが表示されること', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByRole('button', { name: '編集', exact: true }).click();
    await expect(palette.getByText('編集中')).toBeVisible({ timeout: 3000 });
    await expect(palette.locator('textarea[name="edit-palette"]')).toBeVisible();
  });

  test('タブの上でホイールを回すと、チャットウィンドウと同じく次のタブへ移ること', async ({ page }) => {
    const palette = page.locator('chat-palette');
    const pills = palette.locator('.chat-tab-pill');
    await expect(pills.nth(1)).toBeVisible();
    const checkedName = () =>
      palette.locator('input[name^="chat-tab"]:checked').evaluate((input) => input.parentElement!.textContent!.trim());
    const first = await checkedName();

    // パレットは右クリックした位置に開き、ツールバーの下に重なることがあるので、帯へ直接回す。
    await pills
      .first()
      .evaluate((pill) =>
        pill.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
      );

    await expect.poll(checkedName).not.toBe(first);
  });

  test('立ち絵が複数あるコマでは、パレットの立ち絵で名前を読みながら切り替えられること', async ({ page }) => {
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
    // 4 文字の名前が省略されずに読める幅があること。
    expect((await label.boundingBox())!.width).toBeGreaterThanOrEqual(40);

    // シートがパレットに重なって開くので、ボタンへは直接押下を送る。
    await picker.getByRole('button', { name: '次の立ち絵' }).dispatchEvent('click');
    await expect(label).toHaveText('怒り');

    await label.dispatchEvent('click');
    await page.locator('chat-palette [popover]').getByRole('option', { name: 'ひらめき' }).dispatchEvent('click');
    await expect(label).toHaveText('ひらめき');
  });

  test('検索欄は一覧の上にあり、結果は検索欄のすぐ下に出ること', async ({ page }) => {
    const palette = page.locator('chat-palette');
    await palette.getByTestId('palette-search').fill('判定');
    await expect(palette.getByTestId('palette-search-results')).toBeVisible();

    // パネルは開くときに動くので、3 つの位置は同じ瞬間に測る。
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

test.describe('チャット色設定モーダル', () => {
  test('色設定ボタンを押すと chat-color-setting が開けること', async ({ page }) => {
    await waitAppReady(page);
    await page
      .locator('chat-input')
      .getByRole('button', { name: /色設定/ })
      .click();
    await expect(page.locator('chat-color-setting')).toBeVisible({ timeout: 5000 });
    // 編集中の色ぶんのカラーピッカーが居る (name="chat-color-<番号>")。
    await expect(page.locator('chat-color-setting input[type="color"]').first()).toBeAttached();
  });
});
