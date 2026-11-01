import { expect, type Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** How much of the darkness drawn over the table has been painted. */
const paintedPixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('table-vision-overlay canvas') as HTMLCanvasElement | null;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !canvas.width || !canvas.height) return 0;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
    return painted;
  });

async function becomeGameMaster(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
}

/** Opens the scenes as the game master and makes one of the board, darkened, saying a line as it is put on. */
async function makeNightScene(page: Page) {
  await waitAppReady(page);
  await becomeGameMaster(page);
  await openPanel(page, 'シーン');
  const panel = page.getByTestId('scene-panel');
  await expect(panel).toBeVisible({ timeout: 10000 });
  await panel.getByTestId('scene-create').click();
  await expect(panel.getByTestId('scene-row')).toHaveCount(1);
  const editor = panel.getByTestId('scene-editor');
  await editor.getByTestId('scene-part-toggle-darkness').check();
  await editor.getByTestId('scene-part-darkness').locator('select').selectOption({ label: '入れる' });
  const words = editor.getByTestId('scene-text');
  await words.fill('夜が来た');
  await words.blur();
  return panel;
}

test.describe('scenes', () => {
  test('puts a scene made of the board on, darkening the table and saying its words', async ({ page }) => {
    const panel = await makeNightScene(page);
    expect(await paintedPixels(page)).toBe(0);

    await panel.getByTestId('scene-row-apply').click();

    await expect(page.locator('chat-tab chat-message').filter({ hasText: '夜が来た' })).toHaveCount(1);
    await expect(panel.getByTestId('scene-current')).toBeVisible();
    await expect.poll(() => paintedPixels(page), { timeout: 10000 }).toBeGreaterThan(0);
  });

  test('puts a scene on without its words from its menu', async ({ page }) => {
    const panel = await makeNightScene(page);

    await panel.getByTestId('scene-row').click({ button: 'right' });
    await page.locator('context-menu').getByText('テキストを送らずに反映', { exact: true }).click();

    await expect(panel.getByTestId('scene-current')).toBeVisible();
    await expect.poll(() => paintedPixels(page), { timeout: 10000 }).toBeGreaterThan(0);
    await expect(page.locator('chat-tab chat-message').filter({ hasText: '夜が来た' })).toHaveCount(0);
  });

  test('files a scene into a folder made beside it', async ({ page }) => {
    const panel = await makeNightScene(page);

    await panel.getByTestId('scene-create-folder').click();
    const name = panel.getByTestId('folder-name-input');
    await name.fill('村');
    await name.press('Enter');
    await panel.getByTestId('scene-row').click({ button: 'right' });
    const menu = page.locator('context-menu');
    await menu.getByText('フォルダへ移す', { exact: true }).click();
    await menu.getByText('村', { exact: true }).click();

    const folder = panel.locator('[data-folder-area][data-folder-path="村"]');
    await expect(folder.getByTestId('scene-row')).toHaveCount(1);
  });
});

test.describe('the picture in front of the table', () => {
  test('lays a picture over the table from its settings, letting clicks through to the board', async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, 'テーブル設定');
    const setting = page.getByTestId('table-foreground-setting');
    await expect(setting).toBeVisible({ timeout: 10000 });
    await setting.getByTestId('table-foreground-pick').click();
    const picker = page.locator('file-selector');
    await expect(picker).toBeVisible({ timeout: 10000 });
    await picker.locator('img[alt]').first().click();
    await expect(picker).toHaveCount(0);

    const picture = page.getByTestId('table-foreground');
    await expect(picture).toBeVisible({ timeout: 10000 });
    expect(await picture.evaluate((image) => getComputedStyle(image.parentElement!).pointerEvents)).toBe('none');
  });
});
