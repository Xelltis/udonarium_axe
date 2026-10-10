import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel } from '../helpers';
import { becomeGm, closePanels, prepare } from './fixtures';

// The dice are drawn with WebGL, which headless Chromium gives through SwiftShader.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/*
 * The clock is left running: the dice bot's numbers and the identifier of its answer, which seeds
 * the throw, both come of the seeded randomness, so the dice come to rest the same way every time
 * and the picture of them at rest is what is compared. Holding Math.random to one number, as the
 * dice symbol scene does, would hand every new line the same identifier.
 */

async function chooseStage(page: Page, stage: 'frame' | 'table') {
  await becomeGm(page);
  await openPanel(page, '部屋設定');
  await page.getByTestId('dice-stage').selectOption(stage);
  await expect(page.getByTestId('dice-stage')).toHaveValue(stage);
  const settings = page.locator('ui-panel').filter({ has: page.getByTestId('dice-stage') });
  await settings.locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  await page.getByRole('button', { name: /メニューを閉じる/ }).click();
}

async function roll(page: Page, command: string) {
  await page.locator('textarea.chat-input').fill(command);
  await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
}

/** A fingerprint of the dice a canvas holds, or '' while it holds none. */
function diceOn(canvas: Locator): Promise<string> {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d');
    if (!context || element.width < 2) return '';
    const data = context.getImageData(0, 0, element.width, element.height).data;
    let hash = 0;
    let drawn = 0;
    for (let i = 3; i < data.length; i += 4 * 5) {
      hash = (hash * 31 + data[i] + data[i - 1]) | 0;
      if (data[i] > 250) drawn++;
    }
    return drawn > 20 ? String(hash) : '';
  });
}

/** Waits until a canvas holds dice and stops changing, which is when they have come to rest. */
async function atRest(canvas: Locator) {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await diceOn(canvas);
        const still = now !== '' && now === last;
        last = now;
        return still;
      },
      { timeout: 30_000, intervals: [300] }
    )
    .toBe(true);
}

/**
 * Seeds the dice bot's own randomness. It draws its seed from the page's once, as it loads with the
 * first roll, while other work may draw on the page's randomness too, so the numbers it rolls would
 * otherwise change from one run to the next.
 */
async function seedDiceBot(page: Page) {
  await page.evaluate(() => {
    (globalThis as unknown as { Opal: { Random: { $srand(seed: number): void } } }).Opal.Random.$srand(0x2f6e2b1);
  });
}

/**
 * Keeps the dice on the table from fading. The page draws as it would until a frame would draw them
 * fading, a few seconds after they come to rest; every frame from then on is drawn at the moment of
 * the last one that showed them in full, so they lie at rest for as long as the shot takes.
 */
async function keepFromFading(page: Page) {
  await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="table-dice-overlay"]');
    const requestFrame = window.requestAnimationFrame.bind(window);
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    const kept = { at: 0, inFull: 0, held: -1, redrawn: false };
    Object.assign(window, { diceKept: kept });
    window.requestAnimationFrame = (callback) =>
      requestFrame((now) => {
        kept.at = kept.held < 0 ? now : kept.held;
        callback(kept.at);
      });
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      if (this.canvas === overlay && this.globalAlpha < 1 && kept.held < 0) {
        kept.held = kept.inFull;
      } else if (this.canvas === overlay) {
        kept.inFull = kept.at;
        kept.redrawn ||= kept.held >= 0;
      }
      return Reflect.apply(drawImage, this, args);
    } as typeof drawImage;
  });
}

/** Waits until the dice on the table have come to rest and are kept there in full. */
async function keptAtRest(page: Page) {
  await page.waitForFunction(() => (window as unknown as { diceKept: { redrawn: boolean } }).diceKept.redrawn, null, {
    timeout: 30_000,
  });
}

/*
 * Each scene first throws a die it does not shoot. Starting the dice engine draws on the page's
 * randomness, in a quiet moment that could come before the roll or between the roll and its
 * answer, and so would change the numbers the roll comes to; once a die has been drawn, the engine
 * has started, and the roll that is shot draws on the randomness at the same point every time.
 */

test('the dice of a chat roll come to rest in the frame of its answer', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await chooseStage(page, 'frame');
  const stages = page.locator('chat-tab [data-testid="dice-roll-stage"]');
  await roll(page, '1d6');
  await expect(stages.first()).toHaveAttribute('data-state', 'settled', { timeout: 30_000 });
  await atRest(stages.first().locator('canvas'));

  await seedDiceBot(page);
  await roll(page, '2d6+1d20');

  await expect(stages).toHaveCount(2);
  const stage = stages.last();
  await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 30_000 });
  await atRest(stage.locator('canvas'));
  await expect(stage).toHaveScreenshot('dice-3d-frame.png', { maxDiffPixels: 40 });
});

test('the dice of a chat roll come to rest on the table', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await chooseStage(page, 'table');
  const overlay = page.getByTestId('table-dice-overlay');
  await roll(page, '1d6');
  await expect.poll(() => diceOn(overlay), { timeout: 30_000 }).not.toBe('');
  await expect.poll(() => overlay.evaluate((canvas: HTMLCanvasElement) => canvas.width), { timeout: 30_000 }).toBe(1);

  await seedDiceBot(page);
  await keepFromFading(page);
  await roll(page, '2d6+1d20');
  // The dice come down in the middle of the screen, under the windows, which also tell the time.
  await closePanels(page);

  await keptAtRest(page);
  await page.mouse.move(1279, 799);
  await expect(page).toHaveScreenshot('dice-3d-table.png', { maxDiffPixels: 60 });
});
