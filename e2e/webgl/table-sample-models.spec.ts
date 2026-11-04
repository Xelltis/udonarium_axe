import { expect, Page, test } from '@playwright/test';

import { drawSampleModels, waitAppReady } from '../helpers';

/**
 * The sample room a new seat opens with, on a table drawn on a canvas: its pieces are drawn as the
 * models the app bundles for them, read from beside the page and from no peer, while the one piece
 * made without a model is drawn as its picture.
 */

type Hooks = {
  sceneStats(): { models: number } | null;
  spritesOf(identifier: string): { part: string }[];
};

function modelsDrawn(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.models ?? 0);
}

const MODELLED = [
  'モンスターA',
  'モンスターB',
  'モンスターC',
  'キャラクターA',
  'キャラクターB',
  'オーク',
  '弓使い',
  '盗賊',
  '戦士',
];

test.describe('the sample room on a table drawn on a canvas', () => {
  test('draws its pieces as the models bundled for them, read from beside the page, and the scout as its picture', async ({
    page,
  }) => {
    const read: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/assets/models/pieces/')) read.push(new URL(request.url()).pathname);
    });
    await drawSampleModels(page);
    await waitAppReady(page);

    for (const name of [...MODELLED, 'キャラクターC']) {
      await expect(page.locator('game-character').filter({ hasText: name }).first()).toBeAttached();
    }
    await expect.poll(() => modelsDrawn(page), { timeout: 30000 }).toBe(MODELLED.length);
    expect([...new Set(read)].sort()).toEqual(
      ['archer', 'goblin', 'golem', 'knight', 'orc', 'thief', 'warrior', 'wizard'].map(
        (name) => `/assets/models/pieces/${name}.glb`
      )
    );

    const scout = (await page
      .locator('game-character')
      .filter({ hasText: 'キャラクターC' })
      .first()
      .getAttribute('data-object-id'))!;
    const parts = await page.evaluate(
      ({ id }) => (window as unknown as { __axeTable: Hooks }).__axeTable.spritesOf(id).map((sprite) => sprite.part),
      { id: scout }
    );
    expect(parts).toContain('picture');
  });
});
