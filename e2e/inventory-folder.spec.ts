import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

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
  await items(page).first().click({ button: 'right' });
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('フォルダ', { exact: true }).hover();
  const newFolder = page.locator('context-menu').getByText('新しいフォルダ');
  await expect(newFolder).toBeVisible({ timeout: 5000 });
  await newFolder.click();
  await nameEditedFolder(page, folderName);
}

test.describe('インベントリの検索とフォルダ', () => {
  // フォルダはテーブルタブでは使えないので、共有タブに1体だけ置いた状態から始める。
  const listed = 1;

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    await expect(items(page).first()).toBeVisible({ timeout: 5000 });

    await items(page).first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('共有イベントリに移動').click();

    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(1).click();
    await expect(items(page)).toHaveCount(listed, { timeout: 5000 });
  });

  for (const [label, index] of [
    ['テーブル', 0],
    ['墓場', 3],
  ] as const) {
    test(`${label}タブではフォルダを使わせないこと`, async ({ page }) => {
      await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(index).click();

      await expect(page.locator('game-object-inventory button[title="新しいフォルダ"]')).toHaveCount(0);
    });
  }

  test('テーブルタブではコマのメニューにフォルダが出ないこと', async ({ page }) => {
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(0).click();

    await items(page).first().click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('フォルダ', { exact: true })).toHaveCount(0);
  });

  test('共有と個人でフォルダが混ざらないこと', async ({ page }) => {
    await makeEmptyFolder(page, '共有だけの棚');

    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(2).click();
    await expect(page.locator('game-object-inventory [data-folder-dropzone]')).toHaveCount(0);

    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(1).click();
    await expect(
      page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="共有だけの棚"]')
    ).toBeVisible();
  });

  test('検索ボックスで一覧を絞り込み、クリアで戻せること', async ({ page }) => {
    // 検索と絞り込みは自前のパネルに移っており、インベントリの絞り込みボタンから開く。
    await page.locator('game-object-inventory button[title="絞り込みと表示設定"]').click();
    const search = page.locator('inventory-filter-panel input[name="inventory-search"]');
    await expect(search).toBeVisible({ timeout: 5000 });

    // 一括で流し込むとngModelが拾わないので、人と同じように打ち込む。
    await search.click();
    await search.pressSequentially('該当しないはずの名前zzz');
    await expect(items(page)).toHaveCount(0);
    await expect(page.locator('game-object-inventory').getByText('一致するキャラクターがいません')).toBeVisible();

    await page.locator('inventory-filter-panel button[title="検索をクリア"]').click();
    await expect(search).toHaveValue('');
    await expect(items(page)).toHaveCount(listed);
  });

  test('コンテキストメニューからフォルダに入れると見出しが現れ、折りたたみで中身が隠れること', async ({ page }) => {
    await putFirstInFolder(page, '第1話');

    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第1話"]');
    await expect(heading).toBeVisible({ timeout: 5000 });
    await expect(items(page)).toHaveCount(listed);

    await heading.click();
    await expect(items(page)).toHaveCount(listed - 1);

    await heading.click();
    await expect(items(page)).toHaveCount(listed);
  });

  test('フォルダがひとつも無い間は見出しが出ないこと', async ({ page }) => {
    await expect(page.locator('game-object-inventory [data-folder-dropzone]')).toHaveCount(0);

    await putFirstInFolder(page, '第1話');

    await expect(page.locator('game-object-inventory [data-folder-dropzone]')).not.toHaveCount(0);
  });

  test('コマを入れなくてもフォルダだけ先に作れること', async ({ page }) => {
    await makeEmptyFolder(page, '第2話');

    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第2話"]');
    await expect(heading).toBeVisible({ timeout: 5000 });
    await expect(heading).toContainText('0');
    await expect(items(page)).toHaveCount(listed);
  });

  test('見出しのゴミ箱ボタンからフォルダを削除できること', async ({ page }) => {
    await makeEmptyFolder(page, '第2話');
    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第2話"]');

    await heading.locator('button[title="このフォルダを削除"]').click();

    await expect(heading).toHaveCount(0);
  });

  test('右クリックからもフォルダを削除できること', async ({ page }) => {
    await makeEmptyFolder(page, '第2話');
    const heading = page.locator('game-object-inventory [data-folder-dropzone][data-folder-path="第2話"]');

    await heading.click({ button: 'right' });
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('このフォルダを削除').click();

    await expect(heading).toHaveCount(0);
  });
});
