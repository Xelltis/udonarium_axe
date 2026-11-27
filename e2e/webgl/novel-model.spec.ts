import { expect, test } from '@playwright/test';

import { drawSampleModels, openPanel, selectVnSpeaker, vnMessageInput, waitAppReady } from '../helpers';

/** The novel mode with a speaker whose piece is drawn as a 3D model: it stands on the stage as that model. */
test('a piece drawn as a model stands on the novel stage as its model once it speaks', async ({ page }) => {
  await drawSampleModels(page);
  await waitAppReady(page);
  await expect.poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.models ?? 0), { timeout: 30000 }).toBe(9);
  await openPanel(page, 'ノベルモード');
  await expect(page.locator('visual-novel-overlay')).toBeVisible();
  await selectVnSpeaker(page, '魔法使い');
  const input = vnMessageInput(page);
  await input.fill('この先は、わたしが案内しよう。');
  await input.press('Enter');

  const model = page.locator('visual-novel-overlay [data-testid="vn-stage-model"]');
  await expect(model).toHaveCount(1, { timeout: 30000 });
  await expect(model.locator('[data-testid="model-preview"]')).toHaveAttribute('data-state', 'shown', {
    timeout: 30000,
  });
});
