import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, openSaveLoad, revealMenuEntry, waitAppReady } from './helpers';

const ROW_EDGE = { x: 6, y: 6 };

/** Opens the inventory and hands back its graveyard tab, which says how many pieces lie there. */
async function graveyardTab(page: Page): Promise<Locator> {
  await openPanel(page, 'インベントリ');
  const tabs = page.locator('game-object-inventory form[name="game-object-inventory"] > label');
  await expect(tabs).toHaveCount(4, { timeout: 5000 });
  return tabs.nth(3);
}

test.describe('the room this browser starts on', () => {
  test('starts on the room kept here, and on the sample again once it is forgotten', async ({ page }) => {
    test.setTimeout(120_000);
    await waitAppReady(page);
    const graveyard = await graveyardTab(page);
    await expect(graveyard).toContainText(/墓場\s*0/);
    const rows = page.locator('game-object-inventory [data-testid="inventory-item"]');
    await rows.first().click({ button: 'right', position: ROW_EDGE });
    const contextMenu = page.locator('context-menu');
    await expect(contextMenu.locator('li').first()).toBeVisible({ timeout: 3000 });
    await (await revealMenuEntry(page, contextMenu, '墓場に移動')).click();
    await expect(graveyard).toContainText(/墓場\s*1/);

    const menu = await openSaveLoad(page);
    await expect(menu.getByTestId('save-load-start-room-forget')).toBeDisabled();
    await menu.getByTestId('save-load-start-room-keep').click();
    await expect(page.getByText('次からこのブラウザでは、この部屋で始まります。')).toBeVisible({ timeout: 30_000 });

    await waitAppReady(page);
    await expect(await graveyardTab(page)).toContainText(/墓場\s*1/, { timeout: 15_000 });

    const again = await openSaveLoad(page);
    await again.getByTestId('save-load-start-room-forget').click();
    await page.getByRole('button', { name: '元に戻す', exact: true }).click();
    await expect(page.getByText('次からはサンプルの部屋で始まります。')).toBeVisible();

    await waitAppReady(page);
    await expect(await graveyardTab(page)).toContainText(/墓場\s*0/);
  });
});
