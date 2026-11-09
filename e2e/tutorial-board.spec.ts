import { expect, Page, test } from '@playwright/test';

import { closePanels } from './dungeon-helpers';

const TUTORIAL = '[data-object-id^="tutorial"], white-board [data-surface^="tutorial"]';

/** Opens the tutorial board's menu by a right click where the table draws it. */
async function openTutorialBoardMenu(page: Page) {
  const face = page.locator('white-board [data-surface="tutorialBoard"]');
  await expect(face).toBeAttached({ timeout: 20000 });
  const find = () =>
    page.evaluate(() => {
      const hooks = (window as unknown as { __axeTable: { pickAt(x: number, y: number): string | null } }).__axeTable;
      const box = document.querySelector('white-board [data-surface="tutorialBoard"]')!.getBoundingClientRect();
      for (let y = box.top + box.height * 0.6; y < box.bottom; y += 8) {
        for (let x = box.left + 20; x < box.right - 20; x += 8) {
          if (hooks.pickAt(x, y) === 'tutorialBoard' && !document.elementFromPoint(x, y)?.closest('ui-panel'))
            return { x, y };
        }
      }
      return null;
    });
  await expect.poll(find, { message: 'a point of the board in view', timeout: 10000 }).not.toBeNull();
  const at = await find();
  await page.mouse.click(at!.x, at!.y, { button: 'right' });
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  return menu;
}

test.describe('the tutorial the first table opens with', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('game-character').first()).toBeAttached({ timeout: 20000 });
    await page.waitForFunction(() => !!(window as { __axeTable?: unknown }).__axeTable, undefined, { timeout: 20000 });
    await closePanels(page);
  });

  test('stands a board with its words drawn on it and a note to write on, and puts them away from its menu', async ({
    page,
  }) => {
    await expect(page.locator('white-board [data-surface^="tutorialBoard"]')).toHaveCount(1, { timeout: 20000 });
    await expect(page.locator('white-board [data-part="face"] img[src^="blob:"]')).toHaveCount(1, {
      timeout: 20000,
    });
    await expect(page.locator('text-note[data-object-id="tutorialNote"]')).toContainText('クリックすると', {
      timeout: 10000,
    });
    const pieces = await page.locator('game-character').count();
    const menu = await openTutorialBoardMenu(page);

    await menu.getByText('チュートリアルだけを片付ける', { exact: true }).click();

    await expect(page.locator(TUTORIAL)).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('game-character')).toHaveCount(pieces);
  });
});
