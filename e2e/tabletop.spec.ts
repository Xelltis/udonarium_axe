import { expect, test } from '@playwright/test';

import {
  createCharacter,
  createDiceSymbol,
  openPanel,
  openTableContextMenu,
  revealMenuEntry,
  waitAppReady,
} from './helpers';

test.describe('the game table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows the game table (#app-table-layer)', async ({ page }) => {
    await expect(page.locator('#app-table-layer')).toBeVisible();
  });

  test('shows a context menu on a right-click on the table', async ({ page }) => {
    await openTableContextMenu(page);
  });

  test('has create entries in the context menu', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await expect(menu.getByText('キャラクターを作成')).toBeVisible();
    await expect(await revealMenuEntry(page, menu, 'マップマスクを作成')).toBeVisible();
    await expect(await revealMenuEntry(page, menu, '地形を作成')).toBeVisible();
    await expect(await revealMenuEntry(page, menu, '共有メモを作成')).toBeVisible();
  });
});

test.describe('creating objects from the context menu', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('creates a character', async ({ page }) => {
    await createCharacter(page);
  });

  test('creates a shared note', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '共有メモを作成')).click();
    await expect(page.locator('text-note').first()).toBeAttached({ timeout: 10000 });
  });

  test('creates a map mask', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, 'マップマスクを作成')).click();
    await expect(page.locator('game-table-mask').first()).toBeAttached({ timeout: 10000 });
  });

  test('creates terrain', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '地形を作成')).click();
    await expect(page.locator('terrain').first()).toBeAttached({ timeout: 10000 });
  });

  test('creates a deck of playing cards', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, 'トランプの山札を作成')).click();
    await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
  });

  test('creates a dice symbol (D6)', async ({ page }) => {
    await createDiceSymbol(page);
  });

  test('creates a range (circle)', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '射程範囲を作成')).hover();
    await expect(menu.getByText('円形', { exact: true })).toBeVisible({ timeout: 5000 });
    await menu.getByText('円形', { exact: true }).click();
    await expect(page.locator('range').first()).toBeAttached({ timeout: 10000 });
  });

  test('offers every kind of range', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await (await revealMenuEntry(page, menu, '射程範囲を作成')).hover();
    for (const name of ['直線', 'コーン', '三角形', '四角形・ダイヤ', '五角形', '六角形', '円形']) {
      await expect(menu.getByText(name, { exact: true })).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('handling characters', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows a context menu on a right-click on a character', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  });

  test('shows a created character on the inventory’s table tab', async ({ page }) => {
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    await expect(page.locator('game-object-inventory [data-testid="inventory-item"]').first()).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('handling character sheets', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('opens the character sheet from a right-click and "show details"', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });

  test('has copy and save buttons on the character sheet', async ({ page }) => {
    // A character's sheet has no "toggle editing" button (an @if leaves it out for characters). The
    // standing "make a copy" and "save" buttons show instead.
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('game-character-sheet').getByRole('button', { name: 'コピーを作る' })).toBeVisible();
    await expect(page.locator('game-character-sheet').getByRole('button', { name: '保存' })).toBeVisible();
  });

  test('makes a copy of a character', async ({ page }) => {
    await createCharacter(page);
    // The count takes in the preset characters of the default table as well as the new one, so it needs a
    // moment to settle. waitForFunction makes sure of a fixed value.
    const initialCount = await page.locator('game-character').count();
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    // "Make a copy" in context-menu and the button of the same name in game-character-sheet may both be
    // there at once, so the context-menu scope keeps it unique.
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('game-character').count(), { timeout: 10000 }).toBeGreaterThan(initialCount);
  });

  test('shows a character moved to the graveyard on the inventory’s graveyard tab', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, menu, '墓場に移動')).click();
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(3).click();
    await expect(page.locator('game-object-inventory [data-testid="inventory-item"]').first()).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('handling dice symbols', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows "roll the die" in the context menu on a right-click on a die', async ({ page }) => {
    await createDiceSymbol(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('ダイスを振る')).toBeVisible();
  });

  test('finishes the roll action without an error', async ({ page }) => {
    // "Roll the die" only calls callRollDiceSymbol to play the animation that spins the die, and writes
    // nothing to the chat log (only dN commands through bcdice do). This checks that the action runs to
    // its end and the die element stays in the DOM.
    await createDiceSymbol(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('ダイスを振る').click();
    await expect(page.locator('dice-symbol').first()).toBeAttached({ timeout: 5000 });
  });

  test('opens the die’s own sheet from its details', async ({ page }) => {
    await createDiceSymbol(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('詳細を表示').click();
    // dice-symbol-sheet opens as a sheet of its own, with the app- prefix.
    await expect(page.locator('app-dice-symbol-sheet')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('zooming the game table', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('zooms the game table with the wheel', async ({ page }) => {
    // The wheel listener is bound to the <game-table> element, and the transform is written to the parent
    // div of #app-game-table (the #gameTable template reference). A template reference does not become a
    // DOM id, so style.transform is read from the parent of #app-game-table.
    const transformedEl = page.locator('#app-game-table').locator('xpath=..');
    const initialTransform = await transformedEl.evaluate((el) => (el as HTMLElement).style.transform);
    await page.mouse.move(900, 250);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);
    const afterTransform = await transformedEl.evaluate((el) => (el as HTMLElement).style.transform);
    expect(afterTransform).not.toBe(initialTransform);
  });

  test('does not crash when zoomed out and in with the wheel again and again', async ({ page }) => {
    await page.mouse.move(900, 250);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -200);
    }
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 200);
    }
    await expect(page.locator('#app-table-layer')).toBeVisible();
  });
});

test.describe('a character’s chat palette', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('shows the chat palette', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('チャットパレットを表示').click();
    await expect(page.locator('chat-palette')).toBeVisible({ timeout: 10000 });
  });

  test('shows the remote controller', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('リモコンを表示').click();
    await expect(page.locator('remote-controller')).toBeVisible({ timeout: 10000 });
  });
});
