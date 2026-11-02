import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';
import { solidPng } from './png-helpers';

const PICTURES = [
  { name: 'far-hills.png', buffer: solidPng(400, 60, [90, 80, 140]) },
  { name: 'near-town.png', buffer: solidPng(400, 40, [40, 44, 70]) },
];

async function becomeGameMaster(page: Page) {
  const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
  await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();
  await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
}

async function standBehind(settings: Locator, index: number, picture: string) {
  await settings.getByTestId('background-layer-placement').nth(index).selectOption('backdrop');
  await settings.getByTestId('background-layer-image').nth(index).click();
  const picker = settings.page().locator('file-selector');
  await expect(picker).toBeVisible();
  if ((await picker.locator(`img[alt="${picture}"]`).count()) === 0) {
    await picker
      .locator('input[type="file"]')
      .setInputFiles(PICTURES.map((made) => ({ name: made.name, mimeType: 'image/png', buffer: made.buffer })));
  }
  await picker.locator(`img[alt="${picture}"]`).click();
  await expect(picker).toHaveCount(0);
}

test.describe('background layers placed at the back', () => {
  test('moves a back layer further as the view moves the more it follows the camera', async ({ page }) => {
    await waitAppReady(page);
    await becomeGameMaster(page);
    await openPanel(page, 'テーブル設定');
    const settings = page.locator('game-table-setting');
    await expect(settings).toBeVisible({ timeout: 10000 });

    await settings.getByTestId('background-layer-add').click();
    await settings.getByTestId('background-layer-add').click();
    await standBehind(settings, 0, 'far-hills.png');
    await standBehind(settings, 1, 'near-town.png');
    await settings.getByTestId('background-layer-follow').nth(0).fill('10');
    await settings.getByTestId('background-layer-follow').nth(1).fill('60');

    const follows = page.getByTestId('backdrop-layer-follow');
    await expect(follows).toHaveCount(2);
    await page.keyboard.press('Escape');
    const shifts = async () =>
      follows.evaluateAll((elements) =>
        elements.map((element) => Number(/translate3d\(([-\d.]+)px/.exec(element.style.transform)?.[1] ?? NaN))
      );
    const before = await shifts();

    const viewport = page.viewportSize()!;
    const at = { x: viewport.width - 120, y: viewport.height - 80 };
    // Dragged with the middle button, which pans as the left does: a left press held still for a
    // moment opens a marquee instead, and a busy page can be that long telling of the first move.
    await page.mouse.move(at.x, at.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(at.x - 100, at.y, { steps: 8 });
    await page.mouse.up({ button: 'middle' });

    await expect.poll(shifts).not.toEqual(before);
    const after = await shifts();
    // A shift is folded into one picture's width, so a small move back reads as nearly a whole picture.
    const width = 400;
    const moved = after.map((shift, index) => {
      const step = (((shift - before[index]) % width) + width) % width;
      return Math.min(step, width - step);
    });
    expect(moved[1]).toBeGreaterThan(moved[0]);
  });
});
