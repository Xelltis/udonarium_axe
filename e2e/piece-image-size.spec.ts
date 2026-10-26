import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe("a piece picture's width and height", () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
    await piece.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await sheet.locator('button:has(i:text-is("settings"))').first().click();
    await sheet.getByLabel('コマ画像の大きさを指定').check();
  });

  test('moves the height with the width while linked, and stretches the picture once the chain is broken', async ({
    page,
  }) => {
    const sheet = page.locator('game-character-sheet');
    const width = sheet.getByTestId('koma-width');
    const height = sheet.getByTestId('koma-height');
    const chain = sheet.getByTestId('koma-aspect-link');
    await expect(width).not.toHaveValue('');
    await expect(chain).toHaveAttribute('aria-pressed', 'true');

    await height.fill('200');
    await height.dispatchEvent('change');
    const linkedWidth = Number(await width.inputValue());
    await width.fill(String(linkedWidth * 2));
    await width.dispatchEvent('change');
    await expect.poll(async () => Number(await height.inputValue())).toBeGreaterThan(395);
    const heightNow = await height.inputValue();
    const widthInProportion = await width.inputValue();

    await chain.click();
    await expect(chain).toHaveAttribute('aria-pressed', 'false');
    await width.fill('333');
    await width.dispatchEvent('change');
    await expect(height).toHaveValue(heightNow);

    const picture = page
      .locator('game-character')
      .filter({ hasText: 'キャラクターB' })
      .first()
      .locator('img.image.chrome-smooth-image-trick');
    await expect
      .poll(() => picture.evaluate((img) => parseFloat(img.style.width) / parseFloat(img.style.height)))
      .toBeCloseTo(333 / Number(heightNow), 3);

    await chain.click();
    await expect(chain).toHaveAttribute('aria-pressed', 'true');
    await expect(width).toHaveValue(widthInProportion);
    await expect.poll(() => picture.evaluate((img) => img.style.width)).toBe('auto');
  });
});
