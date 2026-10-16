import { expect, Page, test } from '@playwright/test';

import { openSeatDisplay, openSeatWidgets, waitAppReady } from './helpers';

/**
 * The small always-on pieces — clock, link quality, mini player, language —
 * are toggled from the FAB: the widgets from their own menu, the language from the display one.
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

  test('shows and hides the clock from the widgets small menu', async ({ page }) => {
    const clock = page.locator('app-digital-clock > *');
    await expect(clock).toHaveCount(0);

    await toggleWidget(page, 'clock');
    await expect(clock).toBeVisible({ timeout: 5000 });
    // It holds the time, not mere decoration.
    await expect(clock).toContainText(/\d{1,2}:\d{2}/);

    await toggleWidget(page, 'clock');
    await expect(clock).toHaveCount(0, { timeout: 5000 });
  });

  test('says in the connection quality widget that no one else is there', async ({ page }) => {
    const quality = page.locator('app-connection-quality > *');
    await expect(quality).toHaveCount(0);

    await toggleWidget(page, 'connectionQuality');
    await expect(quality).toBeVisible({ timeout: 5000 });
    // The page is open alone, so saying no one is there is right.
    await expect(quality).toContainText('接続中の参加者はいません');
  });

  test('shows and hides the mini player from the widgets small menu', async ({ page }) => {
    // Unlike the clock, this one keeps its element and hides it with hidden.
    const player = page.locator('app-mini-jukebox > *');
    await expect(player).toBeVisible();

    await toggleWidget(page, 'miniPlayer');
    await expect(player).toBeHidden({ timeout: 5000 });

    await toggleWidget(page, 'miniPlayer');
    await expect(player).toBeVisible({ timeout: 5000 });
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

  test('swaps the display small menu for the widgets one when widgets is pressed with it open', async ({ page }) => {
    const display = await openSeatDisplay(page);
    await page.locator('[data-testid="fab-widgets"]').click();

    await expect(display).toBeHidden();
    await expect(page.locator('[data-testid="seat-widgets"]')).toBeVisible();
    await expect(page.locator('[data-testid="fab-widgets"]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-testid="fab-display"]')).toHaveAttribute('aria-expanded', 'false');

    await page.locator('[data-testid="fab-widgets"]').click();
    await expect(page.locator('[data-testid="seat-widgets"]')).toBeHidden();
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
