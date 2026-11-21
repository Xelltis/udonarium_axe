import { expect, test } from '@playwright/test';

import { drawSampleModels, revealMenuEntry, sendMenuEvent } from '../helpers';
import { closePanels, prepare, snap } from './fixtures';

test('a piece’s model set up as gold, on the table and in the preview beside its setting up', async ({ page }) => {
  await drawSampleModels(page);
  await prepare(page);
  await closePanels(page);
  await sendMenuEvent(page.locator('game-character').filter({ hasText: '騎士' }).first());
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await (await revealMenuEntry(page, menu, '詳細を表示', true)).click();
  const sheet = page.locator('game-character-sheet');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  await sheet.getByRole('button', { name: '設定' }).click();
  await sheet.getByTestId('piece-model-setup').locator('summary').click();
  await expect(sheet.getByTestId('model-preview')).toHaveAttribute('data-state', 'shown', { timeout: 30000 });
  await sheet.getByTestId('model-look-preset').selectOption({ label: '黄金' });
  await sheet.getByTestId('model-preview').evaluate((preview) => preview.scrollIntoView({ block: 'start' }));
  await snap(page, 'model-setup');
  await closePanels(page);
  await snap(page, 'model-setup-table');
});
