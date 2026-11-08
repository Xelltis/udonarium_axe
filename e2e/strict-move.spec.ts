import { expect, test } from '@playwright/test';

import { createCharacter, waitAppReady } from './helpers';
import { askForStrictMoves, openMove } from './move-helpers';

test.describe('strict movement', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await createCharacter(page);
    await askForStrictMoves(page);
  });

  test('shows the guide and the reach once a move is started, and clears both once it is given up', async ({
    page,
  }) => {
    await openMove(page);
    await expect(page.locator('[data-testid="move-plan-hint"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('table-move-range-overlay canvas')).toHaveCount(1, { timeout: 5000 });

    await page.keyboard.press('Escape');

    await expect(page.locator('[data-testid="move-plan-hint"]')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('table-move-range-overlay canvas')).toHaveCount(0, { timeout: 5000 });
  });
});
