import { expect, Page, test } from '@playwright/test';

import { becomeGm, closePanels } from '../dungeon-helpers';
import { openPanel, waitAppReady } from '../helpers';

/**
 * Rain, a storm and snow falling through the scene of a table drawn on a canvas, round where the
 * camera looks, rather than across the screen.
 */

type Hooks = {
  renderer(): string | null;
  whenIdle(): Promise<void>;
  sceneStats(): { weatherDrops: number } | null;
};

async function idle(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __axeTable?: Hooks }).__axeTable?.renderer() ?? null), {
      timeout: 20000,
    })
    .not.toBeNull();
  await page.mouse.move(5, 400);
  await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
}

function drops(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.weatherDrops ?? 0);
}

async function chooseWeather(page: Page, kind: string) {
  await openPanel(page, 'テーブル設定');
  await page.locator('select[name="tableWeatherKind"]').selectOption(kind);
  await closePanels(page);
}

test.describe('the weather over a table drawn on a canvas', () => {
  test('falls through the scene once the table asks for rain or snow, the screen drawing no drops of it', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
    await idle(page);
    expect(await drops(page)).toBe(0);

    await chooseWeather(page, 'rain');
    await expect.poll(() => drops(page)).toBeGreaterThan(100);
    await expect(page.locator('table-weather-overlay effect-canvas')).toHaveCount(0);

    await chooseWeather(page, 'snow');
    await expect.poll(() => drops(page)).toBeGreaterThan(50);

    await chooseWeather(page, '');
    await expect.poll(() => drops(page)).toBe(0);
  });
});
