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
});
