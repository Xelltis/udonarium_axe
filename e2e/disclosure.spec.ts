import { expect, Page, test } from '@playwright/test';

import { openPanel, revealMenuEntry, waitAppReady } from './helpers';

/**
 * Disclosure works by keeping what must not be seen out of sight, so when it breaks nothing happens
 * on screen and nobody notices. What becomes of what the GM hid is checked on a player's side,
 * against a piece left public.
 */
test.describe('how far information is disclosed', () => {
  const HIDDEN = 0;
  const PUBLIC = 1;

  async function setRole(page: Page, role: 'GM' | 'PL' | '見学') {
    const panel = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await panel.getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) }).click();
    // The toolbar is swapped once the role has gone round.
    const toolbar = role === 'GM' ? 'app-gm-toolbar [title^="暗闇"]' : 'app-pl-toolbar [title="所有キャラクター一覧"]';
    if (role !== '見学') await expect(page.locator(toolbar)).toBeVisible({ timeout: 10000 });
  }

  const pieceName = (page: Page, index: number) =>
    page.locator('game-character').nth(index).locator('[data-testid="piece-name"]').innerText();

  /** A panel's close button sits under the floating toolbar, so the click is sent to it directly. */
  async function closePanel(page: Page, title: string) {
    await page
      .locator('ui-panel')
      .filter({ hasText: title })
      .locator('button')
      .filter({ hasText: /^\s*close\s*$/ })
      .first()
      .dispatchEvent('click');
    await expect(page.locator('ui-panel').filter({ hasText: title })).toHaveCount(0, { timeout: 5000 });
  }

  /** The menu closes on a mousedown outside it, not on Escape. */
  async function dismissMenu(page: Page) {
    await page.locator('#app-table-layer').click({ position: { x: 40, y: 640 } });
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
  }

  async function openSheet(page: Page, index: number) {
    await page.locator('game-character').nth(index).dispatchEvent('contextmenu');
    await page.locator('context-menu li').filter({ hasText: '詳細を表示' }).click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  }

  /** As the GM, makes one piece GM-only and returns its name. */
  async function hidePiece(page: Page, index: number) {
    const name = await pieceName(page, index);
    await openSheet(page, index);
    await page.locator('disclosure-control').getByRole('button', { name: 'GMのみ' }).click();
    await closePanel(page, 'キャラクターシート');
    return name;
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await setRole(page, 'GM');
  });

  test('keeps a player from touching a piece made GM-only', async ({ page }) => {
    const total = await page.locator('game-character').count();
    await hidePiece(page, HIDDEN);
    await setRole(page, 'PL');

    // A piece left public opens as before. With this passing, the missing menu below can be said to
    // be one that truly does not open, rather than one not drawn yet.
    await page.locator('game-character').nth(PUBLIC).dispatchEvent('contextmenu');
    await expect(page.locator('context-menu li').filter({ hasText: '詳細を表示' })).toBeVisible({ timeout: 5000 });
    await dismissMenu(page);

    // The hidden piece does not even open its menu.
    await page.locator('game-character').nth(HIDDEN).dispatchEvent('contextmenu');
    await expect(page.locator('context-menu')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator('context-menu')).toHaveCount(0);

    // It does not vanish, though; it stays on the table.
    await expect(page.locator('game-character')).toHaveCount(total);
  });

  test('puts a lock on a piece that is not public in the inventory', async ({ page }) => {
    const hidden = await hidePiece(page, HIDDEN);
    const shown = await pieceName(page, PUBLIC);
    await setRole(page, 'PL');

    await openPanel(page, 'インベントリ');
    const inventory = page.locator('game-object-inventory');
    await expect(inventory).toBeVisible({ timeout: 10000 });

    // The name stays, so its being there is known, but it has a lock and its contents cannot be opened.
    await expect(inventory).toContainText(hidden);
    await expect(inventory).toContainText(shown);
    await expect(inventory.locator('i.material-icons', { hasText: 'lock' })).toHaveCount(1);
  });

  test('still lets the GM open a piece they hid', async ({ page }) => {
    const hidden = await hidePiece(page, HIDDEN);
    await openSheet(page, HIDDEN);
    await expect(page.locator('ui-panel').filter({ hasText: 'キャラクターシート' })).toContainText(hidden);
  });

  test('shows the disclosure switch to the GM alone', async ({ page }) => {
    await page.locator('game-character').nth(PUBLIC).dispatchEvent('contextmenu');
    await expect(await revealMenuEntry(page, page.locator('context-menu'), '公開範囲')).toBeVisible({ timeout: 5000 });
    await dismissMenu(page);

    await setRole(page, 'PL');
    await page.locator('game-character').nth(PUBLIC).dispatchEvent('contextmenu');
    await expect(page.locator('context-menu li').filter({ hasText: '詳細を表示' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('context-menu li').filter({ hasText: '公開範囲' })).toHaveCount(0);
  });
});
