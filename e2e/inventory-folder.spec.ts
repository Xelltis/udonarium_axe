import { expect, Locator, Page, test } from '@playwright/test';

import { createCharacter, openPanel, revealMenuEntry, waitAppReady } from './helpers';

/** A row's middle is one of its fields, whose right-click is left to the browser, so menus are opened from its edge. */
const ROW_EDGE = { x: 6, y: 6 };

function items(page: Page) {
  return page.locator('game-object-inventory [data-testid="inventory-item"]');
}

async function nameEditedFolder(page: Page, folderName: string) {
  const nameInput = page.locator('game-object-inventory input[name="folder-name"]');
  await expect(nameInput).toBeFocused({ timeout: 5000 });
  await nameInput.fill(folderName);
  await nameInput.press('Enter');
  await expect(nameInput).toHaveCount(0);
}

async function makeEmptyFolder(page: Page, folderName: string) {
  await page.locator('game-object-inventory button[title="新しいフォルダ"]').click();
  await nameEditedFolder(page, folderName);
}

async function putFirstInFolder(page: Page, folderName: string) {
  await items(page).first().click({ button: 'right', position: ROW_EDGE });
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('フォルダ', { exact: true }).hover();
  const newFolder = page.locator('context-menu').getByText('新しいフォルダ');
  await expect(newFolder).toBeVisible({ timeout: 5000 });
  await newFolder.click();
  await nameEditedFolder(page, folderName);
}

test.describe('searching the inventory, and its folders', () => {
  // Folders cannot be used on the table tab, so the tests start with a single piece on the shared tab.
  const listed = 1;

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    await expect(items(page).first()).toBeVisible({ timeout: 5000 });

    await items(page).first().click({ button: 'right', position: ROW_EDGE });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, menu, '共有イベントリに移動')).click();

    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(1).click();
    await expect(items(page)).toHaveCount(listed, { timeout: 5000 });
  });

  for (const [label, index] of [
    ['テーブル', 0],
    ['墓場', 3],
  ] as const) {
    test(`does not offer folders on the ${label} tab`, async ({ page }) => {
      await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(index).click();

      await expect(page.locator('game-object-inventory button[title="新しいフォルダ"]')).toHaveCount(0);
    });
  }

  test("leaves folders out of a piece's menu on the table tab", async ({ page }) => {
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(0).click();

    await items(page).first().click({ button: 'right', position: ROW_EDGE });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('フォルダ', { exact: true })).toHaveCount(0);
  });

  test('keeps the shared and personal folders apart', async ({ page }) => {
    await makeEmptyFolder(page, '共有だけの棚');

    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(2).click();
    await expect(page.locator('game-object-inventory [data-folder-dropzone]')).toHaveCount(0);

    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(1).click();
    await expect(
      page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="共有だけの棚"]')
    ).toBeVisible();
  });

  test('narrows the list with the search box, and brings it back on clear', async ({ page }) => {
    // Search and filtering have moved to a panel of their own, opened from the inventory's filter button.
    await page.locator('game-object-inventory button[title="絞り込みと表示設定"]').click();
    const search = page.locator('inventory-filter-panel input[name="inventory-search"]');
    await expect(search).toBeVisible({ timeout: 5000 });

    // Text poured in at once is not picked up by ngModel, so it is typed in as a person would.
    await search.click();
    await search.pressSequentially('該当しないはずの名前zzz');
    await expect(items(page)).toHaveCount(0);
    await expect(page.locator('game-object-inventory').getByText('一致するキャラクターがいません')).toBeVisible();

    await page.locator('inventory-filter-panel button[title="検索をクリア"]').click();
    await expect(search).toHaveValue('');
    await expect(items(page)).toHaveCount(listed);
  });

  test('shows a heading once a piece is put in a folder from the context menu, and hides what it holds when folded', async ({
    page,
  }) => {
    await putFirstInFolder(page, '第1話');

    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第1話"]');
    await expect(heading).toBeVisible({ timeout: 5000 });
    await expect(items(page)).toHaveCount(listed);

    await heading.click();
    await expect(items(page)).toHaveCount(listed - 1);

    await heading.click();
    await expect(items(page)).toHaveCount(listed);
  });

  test('shows no heading while there are no folders', async ({ page }) => {
    await expect(page.locator('game-object-inventory [data-folder-dropzone]')).toHaveCount(0);

    await putFirstInFolder(page, '第1話');

    await expect(page.locator('game-object-inventory [data-folder-dropzone]')).not.toHaveCount(0);
  });

  test('makes a folder before any piece is put in it', async ({ page }) => {
    await makeEmptyFolder(page, '第2話');

    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第2話"]');
    await expect(heading).toBeVisible({ timeout: 5000 });
    await expect(heading).toContainText('0');
    await expect(items(page)).toHaveCount(listed);
  });

  test('deletes a folder from the bin button of its heading', async ({ page }) => {
    await makeEmptyFolder(page, '第2話');
    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第2話"]');

    await heading.locator('button[title="このフォルダを削除"]').click();

    await expect(heading).toHaveCount(0);
  });

  test('deletes a folder from the right-click menu too', async ({ page }) => {
    await makeEmptyFolder(page, '第2話');
    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第2話"]');

    await heading.click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('このフォルダを削除').click();

    await expect(heading).toHaveCount(0);
  });
});

test.describe('dragging pieces in the inventory', () => {
  async function moveFirstToShared(page: Page) {
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(0).click();
    await items(page).first().click({ button: 'right', position: ROW_EDGE });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, menu, '共有イベントリに移動')).click();
  }

  /** Presses a row at its edge and carries it, a step at a time, to a point. */
  async function dragRow(page: Page, row: Locator, to: { x: number; y: number }) {
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + ROW_EDGE.x, box.y + ROW_EDGE.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
  }

  async function middleOf(locator: Locator) {
    const box = (await locator.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(items(page).first()).toBeVisible({ timeout: 5000 });
    await moveFirstToShared(page);
    await moveFirstToShared(page);
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(1).click();
    await expect(items(page)).toHaveCount(2, { timeout: 5000 });
  });

  test('files a piece let go anywhere over an open folder, not only over its heading', async ({ page }) => {
    await putFirstInFolder(page, '第1話');
    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第1話"]');
    await expect(heading).toContainText(/第1話\s*1/);
    // The folder comes first, so its piece is the first row and the unfiled one the second.
    const filed = items(page).nth(0);
    const loose = items(page).nth(1);

    await dragRow(page, loose, await middleOf(filed));

    await expect(heading).toContainText(/第1話\s*2/);
  });

  test('draws the carried piece and its name beside the pointer while it travels', async ({ page }) => {
    const row = items(page).first();
    const name = (await row.locator('span.truncate').first().innerText()).trim();
    const box = (await row.boundingBox())!;
    const ghost = page.locator('[data-testid="piece-drag-ghost"]');
    await page.mouse.move(box.x + ROW_EDGE.x, box.y + ROW_EDGE.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });

    await expect(ghost).toBeVisible();
    await expect(ghost).toContainText(name);

    await page.mouse.up();
    await expect(ghost).toHaveCount(0);
  });

  test('moves a piece let go over another tab to the place it shows', async ({ page }) => {
    const tabs = page.locator('game-object-inventory form[name="game-object-inventory"] > label');

    await dragRow(page, items(page).first(), await middleOf(tabs.nth(2)));

    await expect(tabs.nth(1)).toContainText(/共有\s*1/);
    await expect(tabs.nth(2)).toContainText(/個人\s*1/);
    await expect(items(page)).toHaveCount(1);
  });

  test('picks a piece up from one of its fields once the pointer leaves the field', async ({ page }) => {
    const tabs = page.locator('game-object-inventory form[name="game-object-inventory"] > label');
    const field = items(page).first().locator('input[name="data-value"]').first();
    const start = await middleOf(field);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const to = await middleOf(tabs.nth(2));
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();

    await expect(tabs.nth(2)).toContainText(/個人\s*1/);
  });

  test('leaves a press that stays in a field to the field', async ({ page }) => {
    const tabs = page.locator('game-object-inventory form[name="game-object-inventory"] > label');
    const field = items(page).first().locator('input[name="data-value"]').first();
    const start = await middleOf(field);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y, { steps: 4 });
    await page.mouse.up();

    await expect(field).toBeFocused();
    await expect(tabs.nth(1)).toContainText(/共有\s*2/);
  });

  test('moves a piece from the table view too', async ({ page }) => {
    const tabs = page.locator('game-object-inventory form[name="game-object-inventory"] > label');
    const panel = page.locator('ui-panel').filter({ hasText: 'インベントリ' });
    await panel.locator('button[title="リッチ表示"]').dispatchEvent('click');
    const rows = page.locator('game-object-inventory [data-testid="inventory-table-row"]');
    await expect(rows).toHaveCount(2, { timeout: 5000 });

    await dragRow(page, rows.first(), await middleOf(tabs.nth(3)));

    await expect(tabs.nth(3)).toContainText(/墓場\s*1/);
    await expect(rows).toHaveCount(1);
  });
});
