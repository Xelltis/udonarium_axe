import { expect, test } from '@playwright/test';

import { closePanels, waitAppReady } from './helpers';

/**
 * Aiming at pieces without pressing them, as where they stand packed together: by Tab, one piece at
 * a time, and from the list of the pieces this seat may aim at, which the target band opens.
 */
test.describe('aiming without pressing a piece', () => {
  test('aims at a piece by Tab, opens the list from the band, and aims at another from its rows', async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    await page.locator('body').focus();

    await page.keyboard.press('Tab');
    const band = page.getByTestId('target-band');
    await expect(band).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('target-band-count')).toContainText('1');

    await page.getByTestId('target-band-list').click();
    const list = page.getByTestId('target-list');
    await expect(list).toBeVisible({ timeout: 10000 });
    const rows = list.getByTestId('target-list-row');
    await expect(rows.first()).toBeVisible();
    await expect(list.locator('[data-testid="target-list-row"][aria-pressed="true"]')).toHaveCount(1);

    const unaimed = list.locator('[data-testid="target-list-row"][aria-pressed="false"]').first();
    await unaimed.click();

    await expect(list.locator('[data-testid="target-list-row"][aria-pressed="true"]')).toHaveCount(2);
    await expect(page.getByTestId('target-band-count')).toContainText('2');
  });
});
