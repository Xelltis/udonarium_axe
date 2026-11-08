import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * Open country generated for a table drawn on a canvas, its trees, bushes and rocks stood as the 3D
 * models bundled with the app, the many copies of each drawn together with its few meshes.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { models: number; modelMeshes: number } | null;
};

function stats(page: Page): Promise<{ models: number; modelMeshes: number }> {
  return page.evaluate(
    () => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats() ?? { models: -1, modelMeshes: -1 }
  );
}

test.describe('open country generated for a table drawn on a canvas', () => {
  test('stands its trees and rocks as the bundled models, offered by default on a canvas, each model drawn once for all its copies', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await openPanel(page, 'マップ生成');
    const panel = page.locator('ui-panel').filter({ hasText: 'マップ生成' });
    await panel.getByRole('button', { name: 'フィールド', exact: true }).click();
    await expect(panel.getByTestId('field-models')).toBeChecked();
    await panel.locator('#seed').fill('1278372739');
    await panel.getByRole('button', { name: '生成する' }).click();
    await panel.getByRole('button', { name: 'このテーブルへ移動' }).click({ timeout: 120000 });
    const later = page.locator('app-room-restore-banner button', { hasText: 'あとで' });
    if (await later.count()) await later.first().dispatchEvent('click');
    await closePanels(page);

    await expect.poll(async () => (await stats(page)).models, { timeout: 30000 }).toBeGreaterThan(12);
    const { models, modelMeshes } = await stats(page);
    expect(modelMeshes).toBeGreaterThan(0);
    expect(modelMeshes).toBeLessThan(models);
  });
});
