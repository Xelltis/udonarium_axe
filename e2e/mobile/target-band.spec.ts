import { expect, test } from '@playwright/test';

import { waitMobileReady } from '../helpers';

test.use({ viewport: { width: 360, height: 740 } });

/** Aiming on a phone, where there is no Tab and the pieces stand small: from the list the menu opens. */
test.describe('aiming on a narrow phone', () => {
  test('aims at pieces from the list the menu opens, and shows the band whole on a screen 360 wide', async ({
    page,
  }) => {
    await waitMobileReady(page);
    await page.locator('mobile-shell nav button').last().click();
    await page.locator('mobile-shell li button').filter({ hasText: 'ターゲット一覧' }).first().click();
    const list = page.getByTestId('target-list');
    await expect(list).toBeVisible({ timeout: 10000 });
    await list.getByTestId('target-list-row').first().click();
    await list.getByTestId('target-list-row').nth(1).click();
    await page.getByTestId('panel-close').last().click();

    const band = page.getByTestId('target-band');
    await expect(band).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('target-band-count')).toContainText('2');
    const spill = await band.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(spill).toBe(0);
    const edges = await page.getByTestId('target-band-clear').boundingBox();
    const whole = await band.boundingBox();
    expect(edges!.x + edges!.width).toBeLessThanOrEqual(whole!.x + whole!.width);
  });
});
