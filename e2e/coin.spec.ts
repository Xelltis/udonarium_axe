import { expect, Page, test } from '@playwright/test';

import { openTableContextMenu, waitAppReady } from './helpers';

async function createCoin(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('コインを作成').click();
  await expect(page.locator('coin').first()).toBeAttached({ timeout: 10000 });
}

async function openCoinMenu(page: Page) {
  await page.locator('coin').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  return menu;
}

test.describe('コイン', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui-lang', 'ja'));
    await waitAppReady(page);
    await createCoin(page);
  });

  test('両面に紋章が彫られ、縁に厚みがあること', async ({ page }) => {
    const coin = page.locator('coin').first();

    await expect(coin.locator('svg title')).toHaveText(['表', '裏']);
    await expect(coin.locator('svg ellipse')).toHaveCount(12 * 2);
    await expect(coin.locator('div[style*="rotateX(90deg)"]')).toHaveCount(24);
  });

  test('投げると結果がチャットに流れること', async ({ page }) => {
    const menu = await openCoinMenu(page);
    await menu.getByText('コインを投げる').click();

    await expect(page.locator('chat-window')).toContainText(/コイン を投げました → (表|裏)/, { timeout: 10000 });
  });

  test('メニューから面を変えられること', async ({ page }) => {
    const menu = await openCoinMenu(page);
    await menu.getByText('裏にする').click();
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });

    const back = await openCoinMenu(page);
    await expect(back.getByText('表にする')).toBeVisible();
  });

  test('シートで名前を変えられること', async ({ page }) => {
    const menu = await openCoinMenu(page);
    await menu.getByText('コインを編集').click();

    const sheet = page.locator('app-coin-sheet');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.locator('input[type="text"]').fill('運命のコイン');

    const renamed = await openCoinMenu(page);
    await expect(renamed).toContainText('運命のコイン');
  });
});

test.describe('コイン（動きを止めた画面）', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ui-lang', 'ja');
      localStorage.setItem('ui-motion', 'off');
    });
    await waitAppReady(page);
    await createCoin(page);
  });

  test('投げたコインが、出た面をすぐに見せること', async ({ page }) => {
    const coin = page.locator('coin').first();
    const shown = () =>
      coin.evaluate((element) => {
        const face = [...element.querySelectorAll<HTMLElement>('div')].find(
          (div) => div.style.transform.startsWith('translateZ') && div.style.transform.includes('rotateY')
        );
        return face?.style.transform.includes('rotateY(180deg)') ? '裏' : '表';
      });
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
