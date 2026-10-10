import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, openTableContextMenu, waitAppReady } from './helpers';

const SPEAKER = 'キャラクターB';

/**
 * Makes a new cut-in whose scene holds one looping text layer that says `{character}、参戦！`
 * one letter at a time, and leaves the editor on its basic tab.
 */
async function makeSpeakerCutIn(page: Page): Promise<Locator> {
  await waitAppReady(page);
  await openPanel(page, 'カットイン');
  const list = page.locator('app-cut-in-list');
  await expect(list).toBeVisible({ timeout: 10000 });
  await list.locator('button[title="新しいカットインを作る"]').click();
  await expect(list.locator('cut-in-editor')).toBeVisible({ timeout: 5000 });
  // Nothing in the new cut-in speaks for anyone yet, so there is nobody to try it as.
  await expect(list.getByTestId('cut-in-try-speaker')).toHaveCount(0);

  await list.getByRole('tab', { name: 'シーン' }).click();
  await list.locator('cut-in-scene-editor button', { hasText: '文字を足す' }).click();
  const text = list.locator('cut-in-layer-properties textarea[name="cut-in-layer-text"]');
  await text.fill('');
  await list.getByTestId('cut-in-insert-speaker-name').click();
  await expect(text).toHaveValue('{character}');
  await text.press('End');
  await text.pressSequentially('、参戦！');
  await expect(text).toHaveValue('{character}、参戦！');
  await list.getByTestId('cut-in-letter-motion').selectOption({ label: 'タイプ' });
  // Looping keeps the cut-in up until it is stopped, however slowly the checks run.
  await list.locator('cut-in-scene-editor input[name="cut-in-scene-loop"]').check();

  await list.getByRole('tab', { name: '基本設定' }).click();
  const speaker = list.getByTestId('cut-in-try-speaker').locator('select');
  await expect(speaker).toBeVisible();
  return list;
}

async function expectStageSays(page: Page, words: string) {
  const stage = page.locator('app-cut-in-window app-cut-in-stage');
  await expect(stage).toBeVisible({ timeout: 5000 });
  await expect(stage).toHaveText(words);
  await expect(stage.locator('[data-letter-rank]')).toHaveText([...words]);
}

test.describe('カットインの「誰として再生」', () => {
  test('キャラを選んで自分だけ再生すると、{character} がそのキャラの名前になり一文字ずつ描かれること', async ({
    page,
  }) => {
    const list = await makeSpeakerCutIn(page);
    await list.getByTestId('cut-in-try-speaker').locator('select').selectOption({ label: SPEAKER });
    await list.locator('cut-in-editor button[title="自分だけ再生"]').click();
    await expectStageSays(page, `${SPEAKER}、参戦！`);
  });

  test('誰も選ばずに自分だけ再生すると、名前は ？？？ になること', async ({ page }) => {
    const list = await makeSpeakerCutIn(page);
    await expect(list.getByTestId('cut-in-try-speaker').locator('select option:checked')).toHaveText('指定しない');
    await list.locator('cut-in-editor button[title="自分だけ再生"]').click();
    await expectStageSays(page, '？？？、参戦！');
  });
});

test.describe('立ち絵のカットイン位置', () => {
  async function openFitDialog(page: Page): Promise<{ stage: Locator; state: Locator }> {
    await page.getByTestId('portrait-cut-in-fit').click();
    const stage = page.getByTestId('cut-in-fit-stage');
    await expect(stage).toBeVisible({ timeout: 5000 });
    return { stage, state: page.getByTestId('cut-in-fit-state') };
  }

  async function drag(page: Page, stage: Locator) {
    const box = (await stage.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 30, { steps: 5 });
    await page.mouse.up();
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    const piece = page.locator('game-character').filter({ hasText: SPEAKER }).first();
    await piece.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });

  test('ドラッグで設定済みになり、OK で書き込まれ、元に戻して OK で未設定に戻ること', async ({ page }) => {
    const first = await openFitDialog(page);
    await expect(first.state).toHaveAttribute('data-state', 'unset');
    await drag(page, first.stage);
    await expect(first.state).toHaveAttribute('data-state', 'set');
    await page.getByTestId('cut-in-fit-apply').click();
    await expect(first.stage).toBeHidden();

    const second = await openFitDialog(page);
    await expect(second.state).toHaveAttribute('data-state', 'set');
    await page.getByTestId('cut-in-fit-put-back').click();
    await expect(second.state).toHaveAttribute('data-state', 'unset');
    await page.getByTestId('cut-in-fit-apply').click();
    await expect(second.stage).toBeHidden();

    const third = await openFitDialog(page);
    await expect(third.state).toHaveAttribute('data-state', 'unset');
  });

  test('ドラッグしてもキャンセルすれば何も書き込まれないこと', async ({ page }) => {
    const first = await openFitDialog(page);
    await drag(page, first.stage);
    await expect(first.state).toHaveAttribute('data-state', 'set');
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(first.stage).toBeHidden();

    const again = await openFitDialog(page);
    await expect(again.state).toHaveAttribute('data-state', 'unset');
  });
});

test.describe('ホワイトボードの拡大表示', () => {
  test('ポップアップの拡大ボタンで全画面に広がり、クリックで閉じること', async ({ page }) => {
    await waitAppReady(page);
    const menu = await openTableContextMenu(page);
    await menu.getByText('ホワイトボードを作成').click();
    const surface = page.locator('white-board [data-surface]');
    await expect(surface).toHaveCount(1, { timeout: 10000 });

    // The new board stands at the back of the table, partly off screen and partly behind panels,
    // so look for a point where the pointer really lands on it.
    const point = await surface.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hits: { x: number; y: number }[] = [];
      const left = Math.max(rect.left, 0);
      const right = Math.min(rect.right, window.innerWidth);
      const top = Math.max(rect.top, 0);
      const bottom = Math.min(rect.bottom, window.innerHeight);
      for (let y = top + 4; y < bottom; y += 16) {
        for (let x = left + 4; x < right; x += 16) {
          const hit = document.elementFromPoint(x, y);
          if (hit && element.contains(hit)) hits.push({ x, y });
        }
      }
      return hits[Math.floor(hits.length / 2)] ?? null;
    });
    expect(point).not.toBeNull();
    await page.mouse.move(point!.x, point!.y);
    await page.mouse.move(point!.x + 2, point!.y + 2);

    const popup = page.getByTestId('overview-white-board');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup.getByTestId('white-board-face')).toBeVisible();
    await expect(page.getByTestId('enlarged-white-board')).toHaveCount(0);

    await popup.getByTestId('overview-white-board-zoom').click();
    const enlarged = page.getByTestId('enlarged-white-board');
    await expect(enlarged).toBeVisible();
    await expect(enlarged.getByTestId('white-board-face')).toBeVisible();
    const face = (await enlarged.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(face.width).toBeGreaterThan(viewport.width * 0.9);
    expect(face.height).toBeGreaterThan(viewport.height * 0.9);

    await enlarged.click();
    await expect(enlarged).toHaveCount(0);
  });
});
