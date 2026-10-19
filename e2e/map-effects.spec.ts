import { expect, Page, test } from '@playwright/test';

import { createCharacter, openPanel, waitAppReady } from './helpers';

async function openEffectLibrary(page: Page) {
  await openPanel(page, 'エフェクト');
  await expect(page.locator('app-effect-library-panel')).toBeVisible({ timeout: 5000 });
}

test.describe('map effects', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await openEffectLibrary(page);
  });

  test('lists the built-in effects by kind', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');

    await expect(panel.getByText('物理', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: /斬撃/ }).first()).toBeVisible();
  });

  test('filters by name', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('爆炎');

    await expect(panel.getByRole('button', { name: /爆炎/ }).first()).toBeVisible();
    await expect(panel.getByRole('button', { name: /斬撃/ })).toHaveCount(0);
  });

  test('starts picking targets when an effect is chosen, and plays it on the board once a piece is picked', async ({
    page,
  }) => {
    const panel = page.locator('app-effect-library-panel');
    // A long single-target effect is used; a short one is gone right after it fires, before it can be checked.
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('一閃');
    await panel.getByRole('button', { name: /一閃/ }).first().click();

    // The hint for picking targets shows.
    await expect(page.getByText(/コマをクリックで順に選択/).first()).toBeVisible({ timeout: 5000 });

    // With a single target, it fires as soon as one piece is picked.
    // Sent straight to the piece's grab element: the host has no size, so a click would not land on it.
    await page.locator('game-character [appmovable]').first().dispatchEvent('mousedown', { button: 0, buttons: 1 });

    await expect(page.locator('table-effect-overlay > div').first()).toBeAttached({ timeout: 5000 });
  });

  test('cancels target picking with Esc', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('斬撃');
    await panel.getByRole('button', { name: /斬撃/ }).first().click();
    await expect(page.getByText(/コマをクリックで順に選択/).first()).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(page.getByText(/コマをクリックで順に選択/)).toHaveCount(0);
  });

  test('opens the editor from a right-click', async ({ page }) => {
    const panel = page.locator('app-effect-library-panel');
    await panel.getByPlaceholder('名前・系統で絞り込む').fill('斬撃');
    await panel.getByRole('button', { name: /斬撃/ }).first().dispatchEvent('contextmenu');

    await page.locator('context-menu').getByText('編集', { exact: true }).click();

    await expect(page.locator('app-effect-preset-editor')).toBeVisible({ timeout: 5000 });
    // More entries now match in part, such as 「弾の見た目」, so only the section heading is pointed at.
    await expect(page.locator('app-effect-preset-editor').getByText('見た目', { exact: true })).toBeVisible();
  });
});
