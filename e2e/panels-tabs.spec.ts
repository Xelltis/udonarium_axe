import { expect, Locator, Page, test } from '@playwright/test';

import { closeFabMenu, openPanel, waitAppReady } from './helpers';

/** The title bar of a panel, which is what a panel is dragged and dropped by. */
function barOf(panel: Locator): Locator {
  return panel.locator('.bg-ui-titlebar').first();
}

/**
 * Where a bar has come to rest.
 *
 * A panel flies in when it opens, so its bar is still moving and still scaled for a moment.
 * Waited out rather than slept off: a slow machine takes longer than any guess, and a quick
 * one is kept waiting by it.
 */
async function restingBox(bar: Locator) {
  let last: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(
      async () => {
        const box = await bar.boundingBox();
        if (!box) return false;
        const held =
          last !== null &&
          Math.abs(box.x - last.x) < 0.5 &&
          Math.abs(box.y - last.y) < 0.5 &&
          Math.abs(box.width - last.width) < 0.5 &&
          Math.abs(box.height - last.height) < 0.5;
        last = box;
        return held;
      },
      { timeout: 7000, intervals: [50] }
    )
    .toBe(true);
  return last!;
}

async function dragBarOnto(page: Page, from: Locator, to: Locator) {
  // The menu is drawn over the left of the screen, where a panel's bar may well be.
  await closeFabMenu(page);
  const grip = await restingBox(barOf(from));
  const landing = await restingBox(barOf(to));
  // Taken near its left edge: the middle of a bar is often under whatever opened over it.
  await page.mouse.move(grip.x + 40, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(landing.x + landing.width / 2, landing.y + landing.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.describe('パネルをタブにまとめる', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    // The connection panel opens over the left of the screen, where the chat window's bar is.
    await page
      .locator('ui-panel', { has: page.locator('peer-menu') })
      .locator('.bg-ui-titlebar button', { hasText: 'close' })
      .dispatchEvent('click');
    await closeFabMenu(page);
  });

  test('タイトルバーを重ねると 1 枚のパネルにまとまること', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await expect(page.locator('game-table-setting')).toHaveCount(1);
    await openPanel(page, '画像');
    await expect(page.locator('file-storage')).toHaveCount(1);

    const carried = page.locator('ui-panel', { has: page.locator('file-storage') });
    const landing = page.locator('ui-panel', { has: page.locator('game-table-setting') });
    await dragBarOnto(page, carried, landing);

    await expect(landing.locator('[role="tab"]')).toHaveCount(2);
    // Both panels are still standing, one of them behind the other.
    await expect(page.locator('file-storage')).toHaveCount(1);
    await expect(page.locator('game-table-setting')).toHaveCount(1);
  });

  test('まとめても書きかけのチャットが残ること', async ({ page }) => {
    const input = page.locator('textarea.chat-input');
    await input.fill('書きかけの一行');
    await openPanel(page, 'テーブル設定');

    const carried = page.locator('ui-panel', { has: page.locator('game-table-setting') });
    const landing = page.locator('ui-panel', { has: page.locator('chat-window') });
    await dragBarOnto(page, carried, landing);

    await expect(landing.locator('[role="tab"]')).toHaveCount(2);
    await expect(input).toHaveValue('書きかけの一行');
  });

  test('タブを外へドラッグすると単独のパネルに戻ること', async ({ page }) => {
    await openPanel(page, 'テーブル設定');
    await openPanel(page, '画像');
    const carried = page.locator('ui-panel', { has: page.locator('file-storage') });
    const landing = page.locator('ui-panel', { has: page.locator('game-table-setting') });
    await dragBarOnto(page, carried, landing);
    await expect(page.locator('[role="tab"]')).toHaveCount(2);
    const standing = await page.locator('ui-panel').count();

    const pill = await page.locator('[role="tab"]').last().boundingBox();
    await page.mouse.move(pill!.x + pill!.width / 2, pill!.y + pill!.height / 2);
    await page.mouse.down();
    await page.mouse.move(pill!.x + 260, pill!.y + 320, { steps: 12 });
    await page.mouse.up();

    await expect(page.locator('ui-panel')).toHaveCount(standing + 1);
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.locator('file-storage')).toHaveCount(1);
  });
});
