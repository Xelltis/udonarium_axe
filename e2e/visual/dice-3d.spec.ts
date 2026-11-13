import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, openPanel } from '../helpers';
import { becomeGm, closePanels, prepare, reseedRandom, waitChatEditor } from './fixtures';

// The dice are drawn with WebGL, which headless Chromium gives through SwiftShader.
test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

/*
 * The clock is left running: the dice bot's numbers and the identifier of its answer, which seeds
 * the throw, both come of the seeded randomness, so the dice come to rest the same way every time
 * and the picture of them at rest is what is compared. Holding Math.random to one number, as the
 * dice symbol scene does, would hand every new line the same identifier. The randomness is started
 * over just before the roll that is shot, since every change to a synced object draws on it and
 * the throw would otherwise move with anything else the page came to do on the way there.
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
  await waitChatEditor(page);
  await chatInput(page).fill(command);
  await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
}

/**
 * Writes a roll and sends it with the dice bot and the page's randomness started over in between,
 * once the box has checked the roll: checking a roll rolls it, and so draws on both.
 */
async function rollSeeded(page: Page, command: string) {
  await waitChatEditor(page);
  await chatInput(page).fill(command);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await seedDiceBot(page);
  await reseedRandom(page);
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

  await rollSeeded(page, '2d6+1d20');

  await expect(stages).toHaveCount(2);
  const stage = stages.last();
  await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 30_000 });
  await atRest(stage.locator('canvas'));
  await expect(stage).toHaveScreenshot('dice-3d-frame.png');
});

/**
 * Writes a roll and sends it in the same moment as the dice bot and the page's randomness are
 * started over, with no frame between: the table drawn on a canvas makes its parts afresh as it
 * draws, and each takes a number from the page's randomness, so a frame drawn in between would
 * change the roll's identifier, and with it how its dice are thrown.
 */
async function rollSeededAtOnce(page: Page, command: string) {
  await waitChatEditor(page);
  await chatInput(page).fill(command);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.evaluate(() => {
    (globalThis as unknown as { Opal: { Random: { $srand(seed: number): void } } }).Opal.Random.$srand(0x2f6e2b1);
    (window as unknown as { reseedRandom(seed: number): void }).reseedRandom(0x2f6e2b1);
    document.querySelector<HTMLButtonElement>('chat-input button[aria-label="送信"]')!.click();
  });
}

/** Has the chat speak as a piece, so a roll's dice are thrown in front of it, out in the open, rather than in the middle of the screen. */
async function speakAs(page: Page, name: string) {
  const from = page.locator('chat-window .chat-select--from');
  const search = from.locator('input[role="combobox"]');
  await search.fill(name);
  await expect(page.locator('.ng-dropdown-panel').getByRole('option', { name, exact: true })).toBeVisible();
  await search.press('Enter');
  await expect(from.locator('.ng-value-label')).toHaveText(name);
}

/** How many rolls have dice in the scene of the table drawn on a canvas. */
function diceInScene(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __axeTable?: { sceneStats(): { dice: number } | null } }).__axeTable?.sceneStats()
        ?.dice ?? 0
  );
}

/**
 * Holds the moment the page draws at once the dice of a roll in the scene of a canvas table have all
 * come to rest, and keeps them from fading, so they lie at rest for as long as the shot takes
 * however long the page went without a frame on the way there, as it can when tests run side by side.
 */
async function holdDiceInScene(page: Page) {
  await page.evaluate(() => {
    const scene = (window as unknown as { __axeTable: { keepDiceResting(on: boolean): void; diceResting(): boolean } })
      .__axeTable;
    scene.keepDiceResting(true);
    const requestFrame = window.requestAnimationFrame.bind(window);
    const kept = { held: -1 };
    Object.assign(window, { diceKept: kept });
    window.requestAnimationFrame = (callback) =>
      requestFrame((now) => {
        if (kept.held < 0 && scene.diceResting()) kept.held = now;
        callback(kept.held >= 0 ? kept.held : now);
      });
  });
}

test('the dice of a chat roll come to rest in the scene of a table drawn on a canvas', async ({ page }) => {
  test.setTimeout(120_000);
  await prepare(page);
  await chooseStage(page, 'table');
  await speakAs(page, '魔法使い');
  await roll(page, '1d6');
  await expect.poll(() => diceInScene(page), { timeout: 30_000 }).toBe(1);
  await expect.poll(() => diceInScene(page), { timeout: 30_000 }).toBe(0);
  await holdDiceInScene(page);
  await rollSeededAtOnce(page, '2d6+1d20');
  await closePanels(page);
  await page.waitForFunction(() => (window as unknown as { diceKept: { held: number } }).diceKept.held >= 0, null, {
    timeout: 30_000,
  });
  await page.mouse.move(1279, 799);
  await expect(page).toHaveScreenshot('dice-3d-table.png', { timeout: 30_000 });
});
