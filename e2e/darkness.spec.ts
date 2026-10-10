import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/**
 * Darkness used to be switched on by reaching into the component through
 * `window.ng.getComponent`, which only exists in a development build. The suite
 * now runs against the production bundle, so this drives the GM toolbar the way
 * a game master would.
 */
test.describe('暗闇（ステージ効果）', () => {
  /** How much of the overlay canvas has been painted. */
  const paintedPixels = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const canvas = document.querySelector('table-vision-overlay canvas') as HTMLCanvasElement | null;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || !canvas.width || !canvas.height) return 0;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
      return painted;
    });

  test('GM ツールバーの暗闇ボタンでオーバーレイが描画されること', async ({ page }) => {
    await waitAppReady(page);

    // 暗闇の切り替えはGMだけができる。
    const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();
    const darkness = page.locator('app-gm-toolbar [title^="暗闇"]');
    await expect(darkness).toBeVisible({ timeout: 10000 });

    await expect(page.locator('table-vision-overlay canvas')).toBeAttached({ timeout: 10000 });
    expect(await paintedPixels(page)).toBe(0);

    await darkness.click();
    await expect.poll(() => paintedPixels(page), { timeout: 10000 }).toBeGreaterThan(0);

    // もう一度押すと元に戻る。
    await darkness.click();
    await expect.poll(() => paintedPixels(page), { timeout: 10000 }).toBe(0);
  });
});
