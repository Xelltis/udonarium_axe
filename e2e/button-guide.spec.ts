import { expect, Page, test } from '@playwright/test';

import { openPanelFrom, openSeatDisplay, waitAppReady } from './helpers';

/** Every button in the drawer and on the toolbar says what it is at once, and goes quiet again. */
test.describe('showing the names of the buttons all at once', () => {
  async function ready(page: Page) {
    await waitAppReady(page);
    await expect(page.locator('app-pl-toolbar [title="所有キャラクター一覧"]')).toBeVisible({ timeout: 10000 });
    // The chat box can hold the focus after start-up, and a key typed there is text, not a shortcut.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  test('shows a row for T in the list on ?, clear of the button names, and hides it on Esc', async ({ page }) => {
    await ready(page);

    await page.keyboard.press('?');

    const sheet = page.getByTestId('shortcut-sheet');
    const target = sheet.getByTestId('shortcut-sheet-tabletop').getByText('T', { exact: true });
    await expect(target).toBeVisible();
    await expect(target.locator('xpath=following-sibling::dd[1]')).toHaveText(
      '選んだキャラクターだけをターゲットにする'
    );
    await expect(page.locator('app-pl-toolbar [data-testid="button-guide-label"]').first()).toBeVisible();

    // The names settle once the menu's drawer has come out, and the sheet places itself again then.
    await page.waitForTimeout(400);
    const covered = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="shortcut-sheet"]')!.getBoundingClientRect();
      return [...document.querySelectorAll('[data-shortcut-sheet-avoid], [data-guide-label]')]
        .map((element) => ({ name: element.textContent?.trim(), rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .filter(
          ({ rect }) => rect.left < box.right && box.left < rect.right && rect.top < box.bottom && box.top < rect.bottom
        )
        .map(({ name }) => name);
    });
    expect(covered).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('shows the names from a ? added to the toolbar in the menu editor, and from the ? key once it is out of the FAB', async ({
    page,
  }) => {
    await ready(page);
    const display = await openSeatDisplay(page);
    await openPanelFrom(page, display.getByTestId('fab-entry-menuEditor'));
    const editor = page.locator('ui-panel').filter({ has: page.getByTestId('menu-editor-rows') });

    await editor.getByTestId('menu-editor-surface-plToolbar').click();
    await editor.getByTestId('menu-editor-add').click();
    await editor.getByTestId('menu-command-choice-buttonGuide').click();
    const onBar = page.locator('app-pl-toolbar [data-testid="fab-entry-buttonGuide"]');
    await onBar.click();
    await expect(page.locator('app-pl-toolbar [data-testid="button-guide-label"]').first()).toBeVisible();
    await onBar.click();
    await expect(page.locator('app-pl-toolbar [data-testid="button-guide-label"]').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await editor.getByTestId('menu-editor-surface-fab').click();
    await editor.getByTestId('menu-editor-remove-buttonGuide').click();
    await expect(page.getByTestId('fab-menu').getByTestId('fab-entry-buttonGuide')).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('?');
    await expect(page.getByTestId('fab-menu').getByTestId('button-guide-label').first()).toBeVisible();
  });
});
