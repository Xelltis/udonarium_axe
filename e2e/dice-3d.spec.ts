import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, openSeatDisplay, waitAppReady } from './helpers';

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
test.describe('チャットのダイスを 3D で転がす', () => {
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
    await page.locator('textarea.chat-input').fill(command);
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

  test('セリフの枠で転がった d20 が、ダイスボットの出目で止まること', async ({ page }) => {
    await chooseStage(page, 'frame');

    const { answer, total } = await roll(page, '1d20');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-shown', String(total));
    await expect.poll(() => isDrawnOn(stage.locator('canvas')), { timeout: 10000 }).toBe(true);
  });

  test('1d100 は十の位と一の位の d10 が、合わせて出目になる面で止まること', async ({ page }) => {
    await chooseStage(page, 'frame');

    const { answer, total } = await roll(page, '1d100');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    const [tens, units] = ((await stage.getAttribute('data-shown')) ?? '').split(' ');
    expect(tens).toMatch(/^\d0$/);
    expect(units).toMatch(/^\d$/);
    expect(Number(tens) + Number(units) || 100).toBe(total);
  });

  test('卓の上の設定では、卓に重ねた絵にダイスが描かれ、セリフの枠は出ないこと', async ({ page }) => {
    await chooseStage(page, 'table');

    const { answer } = await roll(page, '2d6');

    const sheet = page.getByTestId('table-dice-overlay');
    await expect
      .poll(
        () =>
          sheet.evaluate((canvas: HTMLCanvasElement) => {
            const context = canvas.getContext('2d');
            if (!context || canvas.width < 2) return 0;
            const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let drawn = 0;
            for (let i = 3; i < data.length; i += 4 * 7) if (data[i] > 250) drawn++;
            return drawn;
          }),
        { timeout: 20000 }
      )
      .toBeGreaterThan(20);
    await expect(answer.getByTestId('dice-roll-stage')).toHaveCount(0);
  });

  test('両方の設定では、セリフの枠と卓の上の両方で同じ目に止まること', async ({ page }) => {
    await chooseStage(page, 'both');

    const { answer, total } = await roll(page, '1d20');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-shown', String(total));
    const sheet = page.getByTestId('table-dice-overlay');
    await expect
      .poll(() => sheet.evaluate((canvas: HTMLCanvasElement) => canvas.width), { timeout: 20000 })
      .toBeGreaterThan(1);
  });

  test('51個以上のロールは50個以下の枠に均等に分けて転がり、出目の合計が合うこと', async ({ page }) => {
    test.setTimeout(90000);
    await chooseStage(page, 'frame');

    const { answer, total } = await roll(page, '120d6');

    const stages = answer.getByTestId('dice-roll-stage');
    await expect(stages).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(stages.nth(i)).toHaveAttribute('data-state', 'settled', { timeout: 40000 });
    }
    const shown = await stages.evaluateAll((elements) =>
      elements.map((element) => (element.getAttribute('data-shown') ?? '').split(' ').map(Number))
    );
    expect(shown.map((dice) => dice.length)).toEqual([40, 40, 40]);
    expect(shown.flat().reduce((sum, value) => sum + value, 0)).toBe(total);
    await expect(answer).not.toContainText(/\+\d+$/);
  });

  test('200個を超えるロールは4枠で転がり、残りの個数を最後の枠に出すこと', async ({ page }) => {
    test.setTimeout(90000);
    await chooseStage(page, 'frame');

    const { answer } = await roll(page, '150d6+100d6');

    const stages = answer.getByTestId('dice-roll-stage');
    await expect(stages).toHaveCount(4);
    await expect(stages.last()).toContainText('+50');
    await expect(stages.first()).not.toContainText('+');
  });

  test('出さない設定のときに振った行も、枠に出す設定に替えると出目どおりに止まった姿で出ること', async ({ page }) => {
    await chooseStage(page, 'off');
    const { answer, total } = await roll(page, '1d20');
    await expect(answer.getByTestId('dice-roll-stage')).toHaveCount(0);

    await chooseStage(page, 'frame');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-shown', String(total));
    await expect.poll(() => isDrawnOn(stage.locator('canvas')), { timeout: 10000 }).toBe(true);
  });

  test('マイダイスで選んだ材質で、自分のロールが転がること', async ({ page }) => {
    await chooseStage(page, 'frame');

    await page.getByTestId('chat-my-dice').click();
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

  test('マイダイスで画像を貼ると、選んだ貼り方で自分のロールが転がること', async ({ page }) => {
    await chooseStage(page, 'frame');

    await page.getByTestId('chat-my-dice').click();
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

  test('スキンで選んだマットの色が、ダイスの枠に敷かれること', async ({ page }) => {
    await chooseStage(page, 'frame');
    const display = await openSeatDisplay(page);
    await display.getByTestId('seat-skin').click();
    await page.getByTestId('skin-mat-color-1').click();
    await page
      .locator('ui-panel')
      .filter({ has: page.locator('app-skin-panel') })
      .locator('button', { hasText: /^close$/ })
      .dispatchEvent('click');

    const { answer } = await roll(page, '1d6');

    const stage = answer.getByTestId('dice-roll-stage');
    await expect(stage).toHaveAttribute('data-state', 'settled', { timeout: 20000 });
    await expect(stage).toHaveAttribute('data-mat', '#1f4d3a');
  });

  test('出さない設定では、ロールしても枠が出ないこと', async ({ page }) => {
    await chooseStage(page, 'off');

    const { answer } = await roll(page, '1d20');

    await page.waitForTimeout(1000);
    await expect(answer.getByTestId('dice-roll-stage')).toHaveCount(0);
  });
});
