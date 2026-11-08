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

    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();
    const picture = piece.locator('[data-part="picture"]');
    // A table drawn on a canvas draws the picture as a sprite of the size asked for; the page sizes its own picture.
    const onCanvas = (await page.getByTestId('table-scene').count()) > 0;
    const shape = async () => {
      if (!onCanvas) {
        return picture.evaluate((img) => ({
          width: (img as HTMLElement).style.width,
          height: (img as HTMLElement).style.height,
        }));
      }
      const id = (await piece.getAttribute('data-object-id'))!;
      const sprites = await page.evaluate(
        (identifier) =>
          (
            window as unknown as {
              __axeTable: { spritesOf(id: string): { part: string; widthPx: number; heightPx: number }[] };
            }
          ).__axeTable.spritesOf(identifier),
        id
      );
      const sprite = sprites.find((each) => each.part === 'picture');
      return { width: `${sprite?.widthPx}px`, height: `${sprite?.heightPx}px` };
    };
    const ratio = async () => {
      const { width, height } = await shape();
      return parseFloat(width) / parseFloat(height);
    };
    await expect.poll(ratio).toBeCloseTo(333 / Number(heightNow), 3);

    await chain.click();
    await expect(chain).toHaveAttribute('aria-pressed', 'true');
    await expect(width).toHaveValue(widthInProportion);
    if (onCanvas) await expect.poll(ratio).toBeCloseTo(Number(widthInProportion) / Number(heightNow), 2);
    else await expect.poll(async () => (await shape()).width).toBe('auto');
  });
});
