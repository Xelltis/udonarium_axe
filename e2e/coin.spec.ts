import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry, waitAppReady } from './helpers';

async function createCoin(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'コインを作成')).click();
  await expect(page.locator('coin').first()).toBeAttached({ timeout: 10000 });
}

async function openCoinMenu(page: Page) {
  await page.locator('coin').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('coins (with motion turned off)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ui-lang', 'ja');
      localStorage.setItem('ui-motion', 'off');
    });
    await waitAppReady(page);
    await createCoin(page);
  });

  test('shows the face that came up at once after a throw', async ({ page }) => {
    const coin = page.locator('coin').first();
    const shown = async () => ((await coin.getAttribute('data-face')) === 'back' ? '裏' : '表');
    // The chat draws only the lines that fill it while it follows the bottom, so a throw's line is
    // told by the mark left on the last line before it rather than by how many lines are drawn.
    const latest = page
      .locator('chat-window')
      .getByText(/コイン を投げました → (表|裏)/)
      .last();

    for (let thrown = 0; thrown < 12; thrown++) {
      if (thrown > 0) await latest.evaluate((line) => line.setAttribute('data-read', ''));
      const menu = await openCoinMenu(page);
      await menu.getByText('コインを投げる').click();
      await expect(latest).toBeVisible({ timeout: 10000 });
      await expect(latest).not.toHaveAttribute('data-read', { timeout: 10000 });
      const result = (await latest.innerText()).match(/→ (表|裏)/)![1];

      await expect.poll(shown, { timeout: 2000 }).toBe(result);
      if (result === '裏') return;
    }
  });
});
