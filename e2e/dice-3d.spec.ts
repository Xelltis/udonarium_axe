import { expect, Locator, Page, test } from '@playwright/test';

import { chatInput, openPanel, waitAppReady } from './helpers';

// The dice are drawn with WebGL, which headless Chromium gives through SwiftShader. The switches
// are Chromium's own; WebKit refuses to start with them, and Firefox draws WebGL without.
test.use({
  launchOptions: [
    async ({ browserName }, use) =>
      use(browserName === 'chromium' ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}),
    { scope: 'worker' },
  ],
});

/** A chat roll's dice tumble in the frame of the line that answers it, when the room has them shown there. */
test.describe('rolling chat dice in 3D', () => {
  // One after another in one worker: each roll draws in software and runs the physics in a worker,
  // and six of them at once, one to a worker, starved every browser past its timeouts.
  test.describe.configure({ mode: 'default' });

  async function becomeGameMaster(page: Page) {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
  }

  async function chooseStage(page: Page, stage: 'off' | 'frame' | 'table' | 'both') {
    const select = page.getByTestId('dice-stage');
    if ((await select.count()) < 1) await openPanel(page, '部屋設定');
    await select.selectOption(stage);
    await expect(select).toHaveValue(stage);
  }

  /** Rolls in the chat and gives back the dice bot's answer and the number it came to. */
  async function roll(page: Page, command: string): Promise<{ answer: Locator; total: number }> {
    const answers = page.locator('chat-tab .dicebot-message');
    const before = await answers.count();
    await chatInput(page).fill(command);
    await page.locator('chat-input').getByRole('button', { name: '送信' }).click();
    await expect(answers).toHaveCount(before + 1, { timeout: 15000 });
    const answer = answers.last();
    const text = (await answer.locator('.msg-text').innerText()).trim();
    const total = Number(text.match(/→\s*(\d+)\s*$/)?.[1]);
    expect(Number.isFinite(total)).toBe(true);
    return { answer, total };
  }

  /**
   * Whether dice have been drawn on a canvas: the mat is laid under it by the page, so anything not
   * clear on it is a die or a shadow.
   */
  function isDrawnOn(canvas: Locator): Promise<boolean> {
    return canvas.evaluate((element: HTMLCanvasElement) => {
      const context = element.getContext('2d');
      if (!context || element.width < 1) return false;
      const data = context.getImageData(0, 0, element.width, element.height).data;
      for (let i = 3; i < data.length; i += 4 * 5) if (data[i] > 200) return true;
      return false;
    });
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await becomeGameMaster(page);
  });

  test('shows a line rolled while set not to show the dice, stopped on its result, once set to show them in the frame', async ({
    page,
  }) => {
    await chooseStage(page, 'off');
    const { answer, total } = await roll(page, '1d20');
    await page.waitForTimeout(1000);
    await expect(answer.getByTestId('dice-roll-stage')).toHaveCount(0);

    await chooseStage(page, 'frame');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-shown', String(total));
    await expect.poll(() => isDrawnOn(stage.locator('canvas')), { timeout: 10000 }).toBe(true);
  });

  test("rolls one's own dice in the material chosen in my dice", async ({ page }) => {
    await chooseStage(page, 'frame');

    await page.getByTestId('chat-my-dice').dispatchEvent('click');
    await expect(page.getByTestId('my-dice-try-out')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('my-dice-material-metal').click();
    await expect(page.getByTestId('my-dice-material-metal')).toHaveAttribute('aria-checked', 'true');

    const { answer, total } = await roll(page, '1d20');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-material', 'metal');
    await expect(stage).toHaveAttribute('data-shown', String(total));
    await expect.poll(() => isDrawnOn(stage.locator('canvas')), { timeout: 10000 }).toBe(true);
  });

  test("rolls one's own dice with the picture put on in my dice, laid the way chosen", async ({ page }) => {
    await chooseStage(page, 'frame');

    await page.getByTestId('chat-my-dice').dispatchEvent('click');
    await page.getByTestId('my-dice-picture-file').setInputFiles({
      name: 'checks.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAL0lEQVR4nGPUqAhggIEFNm/g7IQjIljFmRhIBLTXwEKMu5HFB6MfiHH3aDzQXAMAc2EX3rQP/moAAAAASUVORK5CYII=',
        'base64'
      ),
    });
    await expect(page.getByTestId('my-dice-picture-shown')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('my-dice-material-metal')).toBeDisabled();
    await page.getByTestId('my-dice-picture-fit-faces').click();
    await page
      .locator('ui-panel')
      .filter({ has: page.getByTestId('my-dice-picture') })
      .locator('button', { hasText: /^close$/ })
      .dispatchEvent('click');

    const { answer, total } = await roll(page, '1d6');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-picture-fit', 'faces');
    await expect(stage).toHaveAttribute('data-shown', String(total));
    await expect.poll(() => isDrawnOn(stage.locator('canvas')), { timeout: 10000 }).toBe(true);
  });
});
