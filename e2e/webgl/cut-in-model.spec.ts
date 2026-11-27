import { expect, test } from '@playwright/test';

import { drawSampleModels, openPanel, waitAppReady } from '../helpers';

/** A cut-in that shows a 3D model: the model chosen for it stands in the cut-in's window when it is played. */
test('a cut-in given a model shows the model when it is played', async ({ page }) => {
  await drawSampleModels(page);
  await waitAppReady(page);
  await expect.poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.models ?? 0), { timeout: 30000 }).toBe(9);
  await openPanel(page, 'カットイン');
  await expect(page.locator('cut-in-list')).toBeVisible({ timeout: 10000 });
  await page.locator('cut-in-list button[title="新しいカットインを作る"]').click();
  const editor = page.locator('cut-in-list cut-in-editor');
  await expect(editor).toBeVisible({ timeout: 5000 });

  await editor.getByTestId('piece-model').selectOption({ label: 'knight.glb' });
  await editor.getByTestId('cut-in-model-act').selectOption({ label: '攻撃' });
  await editor.locator('button[title="全員に再生"]').click();

  const shown = page.locator('cut-in-window model-preview [data-testid="model-preview"]');
  await expect(shown).toHaveAttribute('data-state', 'shown', { timeout: 30000 });
});
