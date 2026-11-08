import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, openSeatWidgets, waitAppReady } from './helpers';

/**
 * The small always-on pieces are toggled from the FAB: the widgets from their own menu, the
 * language from the display one.
 *
 * Their host elements stay in the DOM with no box of their own, so whether a
 * widget is showing is a question about its content, not about the host.
 */
test.describe('widgets and switching the language', () => {
  /** Shows or hides a widget from the widget menu, and closes it again so it covers nothing. */
  async function toggleWidget(page: Page, key: string) {
    const widgets = await openSeatWidgets(page);
    await widgets.getByTestId(`seat-widget-${key}`).click();
    await page.keyboard.press('Escape');
    await expect(widgets).toBeHidden();
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
  });

  test('shows and hides the player tools from the widgets small menu, and keeps them hidden after a reload', async ({
    page,
  }) => {
    const toolbar = page.locator('app-pl-toolbar .pl-toolbar');
    await expect(toolbar).toBeVisible();

    await toggleWidget(page, 'plToolbar');
    await expect(toolbar).toHaveCount(0);

    await page.reload();
    await waitAppReady(page);
    const widgets = await openSeatWidgets(page);
    await expect(widgets.getByTestId('seat-widget-plToolbar')).toHaveAttribute('aria-pressed', 'false');
    await expect(toolbar).toHaveCount(0);

    await widgets.getByTestId('seat-widget-plToolbar').click();
    await expect(toolbar).toBeVisible();
  });

  test('changes the words on the screen when the language is switched', async ({ page }) => {
    // Tab names are room data and are not translated, so a translated string is checked instead.
    const panel = page.locator('peer-menu');
    await expect(panel).toContainText('ニックネーム');

    const display = await openSeatDisplay(page);
    const language = display.getByTestId('seat-lang');
    await language.click();
    await expect(panel).toContainText('Nickname', { timeout: 10000 });

    // It goes round all three and back, which checks that it does not stop on one.
    await language.click();
    await expect(panel).toContainText('닉네임', { timeout: 10000 });

    await language.click();
    await expect(panel).toContainText('ニックネーム', { timeout: 10000 });
  });
});
