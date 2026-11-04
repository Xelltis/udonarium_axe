import { expect, Page, test } from '@playwright/test';

import { drawSampleModels, waitAppReady } from '../helpers';

/**
 * The sample room a new seat opens with, on a table drawn on a canvas: the pieces made for the models
 * the app bundles are drawn as them, read from beside the page and from no peer, while the rest are
 * drawn as their pictures.
 */

type Hooks = {
  sceneStats(): { models: number } | null;
  spritesOf(identifier: string): { part: string }[];
};

function modelsDrawn(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.models ?? 0);
}

const MODELLED = ['オーク', '弓使い', '盗賊', '戦士', 'ゴブリン', 'ゴーレム', '騎士', '魔法使い', 'ドラゴン'];

/** The sample pieces drawn as their pictures, beside the models, so a room opens with both to try. */
const PICTURED = ['キャラクターA', 'キャラクターB', 'キャラクターC', 'モンスターA', 'モンスターB', 'モンスターC'];

test.describe('the sample room on a table drawn on a canvas', () => {
  test('draws the pieces made for the bundled models as them, read from beside the page, and the rest as their pictures', async ({
    page,
  }) => {
    const read: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/assets/models/pieces/')) read.push(new URL(request.url()).pathname);
    });
    await drawSampleModels(page);
    await waitAppReady(page);

    for (const name of [...MODELLED, ...PICTURED]) {
      await expect(page.locator('game-character').filter({ hasText: name }).first()).toBeAttached();
    }
    await expect.poll(() => modelsDrawn(page), { timeout: 30000 }).toBe(MODELLED.length);
    expect([...new Set(read)].sort()).toEqual(
      ['archer', 'dragon', 'goblin', 'golem', 'knight', 'orc', 'thief', 'warrior', 'wizard'].map(
        (name) => `/assets/models/pieces/${name}.glb`
      )
    );

    for (const name of PICTURED) {
      const identifier = (await page
        .locator('game-character')
        .filter({ hasText: name })
        .first()
        .getAttribute('data-object-id'))!;
      const parts = await page.evaluate(
        ({ id }) => (window as unknown as { __axeTable: Hooks }).__axeTable.spritesOf(id).map((sprite) => sprite.part),
        { id: identifier }
      );
      expect(parts, name).toContain('picture');
    }
  });
});
