import { expect, Page, test } from '@playwright/test';

import { becomeGm } from '../dungeon-helpers';
import { chatInput, openPanel, waitAppReady } from '../helpers';

/**
 * A chat roll's dice thrown on a table drawn on a canvas: drawn in the table's own scene rather than
 * on the sheet laid over the table, and gone from it once they have stayed a while and faded. The
 * chat speaks as a piece, so the dice land in front of it rather than in the middle of the screen,
 * under the chat; a piece standing clear of the chat window, since dice thrown in front of one at its
 * edge come to rest under it as often as not. The first roll builds the dice's shaders and leaves the
 * bare table to compare with; the second roll's dice are kept on show at rest until compared, as a
 * browser drawing in software alongside others can take longer to draw a frame than dice stay.
 */

type Hooks = {
  whenIdle(): Promise<void>;
  sceneStats(): { dice: number } | null;
  keepDiceResting(on: boolean): void;
};

/** Keeps the dice at rest on the table on show, or lets them stay their while and fade. */
function keepResting(page: Page, on: boolean): Promise<void> {
  return page.evaluate((keep) => (window as unknown as { __axeTable: Hooks }).__axeTable.keepDiceResting(keep), on);
}

function dice(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.sceneStats()?.dice ?? -1);
}

/** Closes a panel by its title. */
async function closeThe(page: Page, title: string) {
  await page
    .locator('ui-panel')
    .filter({ hasText: title })
    .locator('.bg-ui-titlebar button', { hasText: 'close' })
    .first()
    .dispatchEvent('click');
}

/** Has the chat speak as a piece, so a roll's dice are thrown in front of it rather than in the middle of the screen, under the chat. */
async function speakAs(page: Page, name: string) {
  const from = page.locator('chat-window .chat-select--from');
  const search = from.locator('input[role="combobox"]');
  await search.fill(name);
  await expect(page.locator('.ng-dropdown-panel').getByRole('option', { name, exact: true })).toBeVisible();
  await search.press('Enter');
  await expect(from.locator('.ng-value-label')).toHaveText(name);
}

/** How many points of a grid over the table's canvas differ between two pictures of it. */
async function differing(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ({ a, b }) => {
      const read = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [first, second] = [await read(a), await read(b)];
      let count = 0;
      for (let y = 0; y < first.height; y += 6) {
        for (let x = 0; x < first.width; x += 6) {
          const i = (y * first.width + x) * 4;
          const gap =
            Math.abs(first.data[i] - second.data[i]) +
            Math.abs(first.data[i + 1] - second.data[i + 1]) +
            Math.abs(first.data[i + 2] - second.data[i + 2]);
          if (gap > 60) count++;
        }
      }
      return count;
    },
    { a: before.toString('base64'), b: after.toString('base64') }
  );
}

test.describe('chat dice thrown on a table drawn on a canvas', () => {
  test('are drawn in the table’s scene and not on the sheet over it, and leave it once they have faded', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, '部屋設定');
    await page.getByTestId('dice-stage').selectOption('table');
    await closeThe(page, '部屋設定');
    await closeThe(page, '接続情報');
    await speakAs(page, '魔法使い');
    const piece = (await page
      .locator('game-character')
      .filter({ hasText: '魔法使い' })
      .locator('[data-location]')
      .first()
      .boundingBox())!;
    const around = { x: piece.x - 50, y: piece.y - 150, width: piece.width + 200, height: piece.height + 300 };
    const picture = () => page.screenshot({ clip: around });
    const roll = async () => {
      await chatInput(page).fill('4d6');
      await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
      await expect.poll(() => dice(page), { timeout: 20000 }).toBe(1);
    };
    const gone = async () => {
      await expect.poll(() => dice(page), { timeout: 20000 }).toBe(0);
      await page.evaluate(() => (window as unknown as { __axeTable: Hooks }).__axeTable.whenIdle());
      return picture();
    };
    await roll();
    const bare = await gone();

    await keepResting(page, true);
    await roll();
    await expect.poll(async () => differing(page, bare, await picture()), { timeout: 20000 }).toBeGreaterThan(20);
    await keepResting(page, false);
    expect(await differing(page, bare, await gone())).toBeLessThan(5);
  });
});
