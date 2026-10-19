import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  openPanel,
  openTableContextMenu,
  openVnSpeakerList,
  selectVnSpeaker,
  vnMessageInput,
  waitAppReady,
} from './helpers';

/** The log now has a window of its own, so it sits outside the overlay. */
const backlogPanel = (page: Page) =>
  page.locator('.draggable-panel').filter({ has: page.locator('visual-novel-backlog') });

/**
 * A panel just opened grows as it comes in, so it is measured once the animation has finished.
 * Measured partway, it gives 0.8 times its size, and the before-and-after comparison goes wrong.
 */
async function settledBox(locator: Locator) {
  await locator.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  );
  const box = await locator.boundingBox();
  if (!box) throw new Error('panel not found');
  return box;
}

test.describe('visual novel mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ui-lang', 'ja'));
    await waitAppReady(page);
    await openPanel(page, 'ノベルモード');
    await expect(page.locator('visual-novel-overlay')).toBeVisible();
  });

  test('closes novel mode with the exit button', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="終了"]').click();
    await expect(page.locator('visual-novel-overlay')).toHaveCount(0);
  });

  test('shows a line sent from the input box in the novel window', async ({ page }) => {
    const input = vnMessageInput(page);
    await input.fill('やあ、これはテストです');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('やあ、これはテストです', { timeout: 15000 });
  });

  test('goes back and forth between messages with the history navigation', async ({ page }) => {
    const input = vnMessageInput(page);
    await input.fill('一つ目');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('一つ目', { timeout: 15000 });
    await input.fill('二つ目');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('二つ目', { timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="前のメッセージ"]').click();
    await expect(page.locator('visual-novel-overlay')).toContainText('一つ目');
    await page.locator('visual-novel-overlay button[title="次のメッセージ"]').click();
    await expect(page.locator('visual-novel-overlay')).toContainText('二つ目', { timeout: 15000 });
  });

  test('lets the table be right-clicked in VN mode', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await expect(menu.getByText('キャラクターを作成')).toBeVisible();
  });

  test('lets an existing panel (connection info) be used in VN mode', async ({ page }) => {
    const peerMenu = page.locator('peer-menu');
    await expect(peerMenu).toBeVisible();
    const input = peerMenu.locator('input').first();
    await input.click();
    await expect(input).toBeFocused();
  });

  test('shows only the text of a line with an emote, in both the chat and the VN view', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await page.locator('visual-novel-emote-panel button', { hasText: '叫び' }).click();
    await page.locator('visual-novel-emote-panel button', { hasText: 'ゆれ' }).click();
    await page.locator('visual-novel-overlay button[title="演出"]').click();

    const input = vnMessageInput(page);
    await input.fill('なんだって！？');
    await input.press('Enter');

    await expect(page.locator('chat-message').last()).toContainText('なんだって！？', { timeout: 15000 });
    await expect(page.locator('chat-message').last()).not.toContainText('〔');
    await expect(page.locator('visual-novel-overlay')).toContainText('なんだって！？', { timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await page.locator('visual-novel-emote-panel button', { hasText: 'リセット' }).click();
    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await expect(page.locator('visual-novel-overlay')).not.toContainText('〔叫び・ゆれ〕');
  });

  test('rolls dice with a chosen dice bot (the chat still works)', async ({ page }) => {
    const diceBotSelect = page.locator('visual-novel-overlay select[title="ダイスボット"]');
    await expect(diceBotSelect.locator('option').nth(1)).toBeAttached({ timeout: 15000 });

    const input = vnMessageInput(page);
    await input.fill('2d6');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('2 / 2', { timeout: 20000 });
    await expect(page.locator('visual-novel-overlay img[src*="system_chang_roll"]')).toBeVisible();
    await expect(page.locator('visual-novel-overlay')).toContainText('システムちゃん');
    await expect(page.locator('chat-portrait-img img')).toHaveCount(0);
  });

  test('shows neither a portrait nor a bubble for a character’s dice command', async ({ page }) => {
    await selectVnSpeaker(page, 'モンスターA');
    const input = vnMessageInput(page);
    await input.fill('5d6');
    await input.press('Enter');

    await expect(page.locator('visual-novel-overlay img[src*="system_chang_roll"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('visual-novel-overlay')).toContainText('（モンスターA のロール）');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toHaveCount(0);

    await page.locator('visual-novel-overlay button[title="前のメッセージ"]').click();
    await expect(page.locator('visual-novel-overlay')).toContainText('5d6');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toHaveCount(0);
  });

  test('picks the standing position directly from the slot guide', async ({ page }) => {
    await selectVnSpeaker(page, 'モンスターB');
    const slotButton = page.locator('visual-novel-overlay button[title="立ち位置スロット"]');
    await expect(slotButton).toContainText('1/12');
    await slotButton.click();
    const columns = page.locator('visual-novel-overlay .pointer-events-auto.absolute.inset-x-0 > button');
    await expect(columns).toHaveCount(12);
    await columns.nth(7).click();
    await expect(slotButton).toContainText('8/12');
  });

  test('draws a portrait in the right-end slot (11/12) at the same size as the others', async ({ page }) => {
    const input = vnMessageInput(page);
    const slotBtn = page.locator('visual-novel-overlay button[title="立ち位置スロット"]');
    const columns = page.locator('visual-novel-overlay .pointer-events-auto.absolute.inset-x-0 > button');

    await selectVnSpeaker(page, 'モンスターA');
    await slotBtn.click();
    await columns.nth(1).click();
    await input.fill('スロット2です');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toBeVisible({ timeout: 15000 });

    await selectVnSpeaker(page, 'モンスターB');
    await slotBtn.click();
    await columns.nth(11).click();
    await input.fill('スロット12です');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターB"]')).toBeVisible({ timeout: 15000 });

    await page.waitForTimeout(700);
    const left = await page.locator('visual-novel-overlay img[alt="モンスターA"]').boundingBox();
    const right = await page.locator('visual-novel-overlay img[alt="モンスターB"]').boundingBox();
    if (!left || !right) throw new Error('portrait not found');
    expect(Math.abs(right.width / 1.05 - left.width)).toBeLessThan(4);
  });

  test('shows the GM’s narration and location effects', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await page.locator('visual-novel-emote-panel button', { hasText: '地の文' }).click();
    await page.locator('visual-novel-overlay button[title="演出"]').click();

    const input = vnMessageInput(page);
    await input.fill('一行は深い森へと足を踏み入れた。');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay .vn-enter-narration')).toContainText('一行は深い森へと', {
      timeout: 15000,
    });
    await expect(page.locator('chat-message').last()).toContainText('一行は深い森へと足を踏み入れた。');
    await expect(page.locator('chat-message').last()).not.toContainText('〔');

    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await page.locator('visual-novel-emote-panel button', { hasText: 'ロケーション' }).click();
    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await input.fill('忘れられた森');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay .vn-enter-location')).toContainText('忘れられた森', {
      timeout: 15000,
    });
  });

  test('edits a line from the log (rewriting its text and effects)', async ({ page }) => {
    const input = vnMessageInput(page);
    await input.fill('もとの発言');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('もとの発言', { timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="ログ"]').click();
    const row = page.locator('visual-novel-backlog [data-vn-log-id]').first();
    await row.hover();
    await row.locator('button[title="編集"]').click();

    const textarea = row.locator('textarea');
    await textarea.fill('編集後の発言');
    await row.locator('select[title="吹き出しの形"]').selectOption('thought');
    await row.getByRole('button', { name: '保存' }).click();

    await expect(row).toContainText('編集後の発言');
    await expect(row).toContainText('〔もやもや〕');
    await expect(page.locator('chat-message').last()).toContainText('編集後の発言');
    await expect(page.locator('chat-message').last()).not.toContainText('〔');
  });

  test('moves the log panel by dragging', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="ログ"]').click();
    const panel = backlogPanel(page);
    const before = await settledBox(panel);
    await page.mouse.move(before.x + 60, before.y + 14);
    await page.mouse.down();
    await page.mouse.move(before.x + 60 - 120, before.y + 14 + 80, { steps: 6 });
    await page.mouse.up();
    const after = await settledBox(panel);
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);
  });

  test('resizes the log panel by dragging its edge', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="ログ"]').click();
    const panel = backlogPanel(page);
    const before = await settledBox(panel);

    const handle = panel.locator('.ui-resize-handler-se');
    const grip = await handle.boundingBox();
    if (!grip) throw new Error('resize handle not found');
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 160, grip.y + grip.height / 2 - 120, { steps: 6 });
    await page.mouse.up();

    const after = await settledBox(panel);
    expect(before.width - after.width).toBeGreaterThan(100);
    expect(before.height - after.height).toBeGreaterThan(60);
  });

  test('keeps the log and the effects panel open together', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="ログ"]').click();
    await expect(backlogPanel(page)).toBeVisible();

    await page.locator('visual-novel-overlay button[title="演出"]').click();

    await expect(backlogPanel(page)).toBeVisible();
    await expect(page.locator('visual-novel-emote-panel button', { hasText: '叫び' })).toBeVisible();
  });

  test('lets the GM sweep away the portraits and lines with a scene break', async ({ page }) => {
    await page.locator('peer-menu').getByRole('button', { name: 'GM', exact: true }).click();

    const input = vnMessageInput(page);
    await selectVnSpeaker(page, 'モンスターA');
    await input.fill('第一幕の発言');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toBeVisible({ timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await page.locator('visual-novel-emote-panel button', { hasText: '場面転換' }).click();
    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await input.fill('〜その夜〜');
    await input.press('Enter');

    await expect(page.locator('visual-novel-overlay .vn-enter-scene')).toContainText('〜その夜〜', { timeout: 15000 });
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toHaveCount(0);
  });

  test('keeps a player’s own lines out of the novel itself but in the log', async ({ page }) => {
    const input = vnMessageInput(page);
    await selectVnSpeaker(page, 'モンスターA');
    await input.fill('舞台の台詞');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('舞台の台詞', { timeout: 15000 });

    // The novel's input box speaks only as a character, so the small talk is sent from the usual chat.
    await openPanel(page, 'チャット');
    const chatInput = page.locator('chat-window textarea').first();
    await chatInput.fill('ちょっと待ってください');
    await chatInput.press('Enter');
    await expect(page.locator('chat-message').last()).toContainText('ちょっと待ってください', { timeout: 15000 });

    await expect(page.locator('visual-novel-overlay')).toContainText('舞台の台詞');
    await expect(page.locator('visual-novel-overlay')).not.toContainText('ちょっと待ってください');

    await page.locator('visual-novel-overlay button[title="ログ"]').click();
    await expect(page.locator('visual-novel-backlog')).toContainText('ちょっと待ってください');
  });

  test('clears only the stage on the GM’s portrait reset, without showing it in the novel itself', async ({ page }) => {
    await page.locator('peer-menu').getByRole('button', { name: 'GM', exact: true }).click();

    const input = vnMessageInput(page);
    await selectVnSpeaker(page, 'モンスターA');
    await input.fill('まだ舞台にいる');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toBeVisible({ timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="進行"]').click();
    await page.locator('visual-novel-direction-panel button', { hasText: '立ち絵をリセット' }).click();

    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toHaveCount(0);
    // The notice stays in the chat log, but the novel stays on the last line.
    await expect(page.locator('chat-message').last()).toContainText('立ち絵をリセット', { timeout: 15000 });
    await expect(page.locator('visual-novel-overlay')).toContainText('まだ舞台にいる');
    await expect(page.locator('visual-novel-overlay')).not.toContainText('立ち絵をリセットしました');
  });

  test('keeps the portrait through a line marked to leave, and clears it on the next line', async ({ page }) => {
    const input = vnMessageInput(page);
    await selectVnSpeaker(page, 'モンスターA');
    await input.fill('まだここにいる');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toBeVisible({ timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await page.locator('visual-novel-emote-panel button', { hasText: 'この発言で退場する' }).click();
    await page.locator('visual-novel-overlay button[title="演出"]').click();
    await input.fill('では、またな');
    await input.press('Enter');

    await expect(page.locator('chat-message').last()).toContainText('では、またな', { timeout: 15000 });
    // The portrait stays while the parting line is said, and is seen off with a fade.
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toBeVisible();

    await selectVnSpeaker(page, 'モンスターB');
    await input.fill('行ってしまった');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay img[alt="モンスターB"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('visual-novel-overlay img[alt="モンスターA"]')).toHaveCount(0);
  });

  test('switches the layout to ADV', async ({ page }) => {
    const input = vnMessageInput(page);
    await input.fill('レイアウトの確認');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('レイアウトの確認', { timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="表示設定"]').click();
    await page.locator('visual-novel-display-panel button', { hasText: 'ADV' }).click();
    await page.locator('visual-novel-overlay button[title="表示設定"]').click();

    await expect(page.locator('visual-novel-overlay .vn-bubble-normal')).toHaveCount(0);
    await expect(page.locator('visual-novel-overlay')).toContainText('レイアウトの確認');
  });

  test('lets only the GM switch showcase mode', async ({ page }) => {
    const directionButton = page.locator('visual-novel-overlay button[title="進行"]');
    await expect(directionButton).toHaveCount(0);

    await page.locator('peer-menu').getByRole('button', { name: 'GM', exact: true }).click();
    await expect(directionButton).toBeVisible();

    await directionButton.click();
    const showcase = page.locator('visual-novel-direction-panel button', { hasText: '上映モード' });
    await showcase.click();
    await expect(page.locator('visual-novel-overlay')).toContainText('上映中（あなたが進行）');

    await showcase.click();
    await expect(page.locator('visual-novel-overlay')).not.toContainText('上映中（あなたが進行）');
  });

  test('records a flipped portrait with the line, showing it and replaying it from history', async ({ page }) => {
    await selectVnSpeaker(page, 'モンスターA');
    const input = vnMessageInput(page);
    await input.fill('まっすぐ立つ');
    await input.press('Enter');
    const portrait = page.locator('visual-novel-overlay img[alt="モンスターA"]');
    await expect(portrait).toBeVisible({ timeout: 15000 });
    await expect(portrait).not.toHaveClass(/-scale-x-100/);

    const flipButton = page.locator('visual-novel-overlay button[title="立ち絵を反転"]');
    await expect(flipButton).toContainText('通常');
    await flipButton.click();
    await expect(flipButton).toContainText('反転中');

    await input.fill('ふりむく');
    await input.press('Enter');
    await expect(page.locator('chat-message').last()).toContainText('ふりむく', { timeout: 15000 });
    await expect(portrait).toHaveClass(/-scale-x-100/);

    await page.locator('visual-novel-overlay button[title="前のメッセージ"]').click();
    await expect(portrait).not.toHaveClass(/-scale-x-100/);
  });

  test('puts a chat palette line into the input box', async ({ page }) => {
    await selectVnSpeaker(page, 'モンスターA');
    await page.locator('visual-novel-overlay button[title="チャットパレット"]').click();
    const firstLine = page.locator('visual-novel-overlay .vn-palette-line').first();
    await expect(firstLine).toBeVisible();
    const lineText = (await firstLine.textContent())?.trim() ?? '';
    await firstLine.click();
    await expect(vnMessageInput(page)).toHaveValue(lineText);
  });

  test('lists preset sounds and cut-ins on the SE board', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="SE再生"]').click();

    const board = page.locator('visual-novel-overlay');
    await expect(board).toContainText('プリセット');
    await expect(board).toContainText('カットイン');

    // Presets can be looked up by name.
    const filter = page.locator('visual-novel-overlay input[placeholder="音・カットインを検索…"]');
    await filter.fill('障壁');
    await expect(board.locator('button', { hasText: '障壁' }).first()).toBeVisible();
  });

  test('lists the registered sounds on the SE board', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="SE再生"]').click();
    await expect(page.locator('visual-novel-overlay').getByText('サウンドエフェクト')).toBeVisible();
  });

  test('plays automatically from the oldest to the newest on play from the start', async ({ page }) => {
    const input = vnMessageInput(page);
    for (const line of ['一幕', '二幕', '三幕']) {
      await input.fill(line);
      await input.press('Enter');
      await expect(page.locator('visual-novel-overlay')).toContainText(line, { timeout: 15000 });
    }

    await page.locator('visual-novel-overlay button[title="最初から再生"]').click();
    await expect(page.locator('.vn-auto-badge')).toBeVisible();
    await expect(page.locator('visual-novel-overlay')).toContainText('1 / 3');
    await expect(page.locator('visual-novel-overlay')).toContainText('2 / 3', { timeout: 15000 });
    await expect(page.locator('visual-novel-overlay')).toContainText('3 / 3', { timeout: 15000 });
    await expect(page.locator('.vn-auto-badge')).toHaveCount(0, { timeout: 15000 });
  });

  test('starts autoplay from where it is, and does not start it while the newest is shown', async ({ page }) => {
    const input = vnMessageInput(page);
    for (const line of ['一幕', '二幕', '三幕']) {
      await input.fill(line);
      await input.press('Enter');
      await expect(page.locator('visual-novel-overlay')).toContainText(line, { timeout: 15000 });
    }

    const autoPlay = page.locator('visual-novel-overlay button[title="オートプレイ"]');
    await expect(autoPlay).toBeDisabled();

    await page.locator('visual-novel-overlay button[title="前のメッセージ"]').click();
    await expect(page.locator('visual-novel-overlay')).toContainText('2 / 3');
    await autoPlay.click();
    await expect(page.locator('.vn-auto-badge')).toBeVisible();
    await expect(page.locator('visual-novel-overlay')).toContainText('3 / 3', { timeout: 15000 });
  });

  test('stops autoplay on a click during it', async ({ page }) => {
    const input = vnMessageInput(page);
    for (const line of ['一幕', '二幕', '三幕']) {
      await input.fill(line);
      await input.press('Enter');
      await expect(page.locator('visual-novel-overlay')).toContainText(line, { timeout: 15000 });
    }

    await page.locator('visual-novel-overlay button[title="最初から再生"]').click();
    await expect(page.locator('.vn-auto-badge')).toBeVisible();
    await page.locator('visual-novel-overlay button[title="次のメッセージ"]').click();
    await expect(page.locator('.vn-auto-badge')).toHaveCount(0);
  });

  test('lets the GM speak under their own name from novel mode as well', async ({ page }) => {
    await expect(page.locator('visual-novel-overlay')).toContainText('モンスターA');
    await page.locator('peer-menu').getByRole('button', { name: 'GM', exact: true }).click();

    await selectVnSpeaker(page, 'プレイヤー（あなた）');
    const input = vnMessageInput(page);
    await input.fill('では、判定をどうぞ');
    await input.press('Enter');

    // It shows at the top of the screen like a system message, not in a portrait's bubble.
    await expect(page.locator('visual-novel-overlay')).toContainText('では、判定をどうぞ', { timeout: 15000 });
    await expect(page.locator('chat-message').last()).toContainText('では、判定をどうぞ');
  });

  test('opens the stream of lines in another window from novel mode', async ({ page }) => {
    const input = vnMessageInput(page);
    await selectVnSpeaker(page, 'モンスターA');
    await input.fill('舞台の台詞');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('舞台の台詞', { timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="発言の流れ"]').click();

    const stream = page.locator('chat-stream');
    await expect(stream).toBeVisible();
    await expect(stream).toContainText('舞台の台詞');

    await page.locator('visual-novel-overlay button[title="発言の流れ"]').click();
    await expect(stream).toHaveCount(0);
  });

  test('leaves the player out of the speaker choices', async ({ page }) => {
    const panel = await openVnSpeakerList(page);
    await expect(panel.getByRole('option').first()).toBeVisible();
    await expect(panel.getByRole('option', { name: /プレイヤー/ })).toHaveCount(0);
  });

  test('filters the speakers by name', async ({ page }) => {
    const panel = await openVnSpeakerList(page);
    const before = await panel.getByRole('option').count();
    expect(before).toBeGreaterThan(1);

    await page.locator('visual-novel-overlay [data-testid="vn-speaker"] input').fill('モンスターB');

    await expect(panel.getByRole('option')).toHaveCount(1);
    await expect(panel.getByRole('option', { name: 'モンスターB', exact: true })).toBeVisible();
  });

  test('makes the playback speed slider and the sheet button in the top row work', async ({ page }) => {
    const slider = page.locator('visual-novel-overlay [title="再生速度"] input[type="range"]');
    await expect(slider).toBeVisible();
    await slider.fill('2');
    await expect(page.locator('visual-novel-overlay [title="再生速度"]')).toContainText('×2');

    await selectVnSpeaker(page, 'モンスターA');
    const sheetButton = page.locator('visual-novel-overlay button[title="キャラクターシート参照"]');
    await sheetButton.click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });

    // "Visible" alone is not enough. The novel mode backdrop covers the whole screen, so this also
    // checks that the sheet has not gone under it.
    const stacking = await page.evaluate(() => {
      const overlay = document.querySelector('visual-novel-overlay');
      const sheet = document.querySelector('game-character-sheet')?.closest('.draggable-panel');
      if (!(overlay instanceof HTMLElement) || !(sheet instanceof HTMLElement)) return null;
      return { overlay: Number(getComputedStyle(overlay).zIndex), sheet: Number(getComputedStyle(sheet).zIndex) };
    });
    expect(stacking).not.toBeNull();
    expect(stacking!.sheet).toBeGreaterThan(stacking!.overlay);

    await sheetButton.click();
    await expect(page.locator('game-character-sheet')).toHaveCount(0);
  });

  test('jumps to a past message from the backlog', async ({ page }) => {
    const input = vnMessageInput(page);
    await input.fill('一つ目');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('一つ目', { timeout: 15000 });
    await input.fill('二つ目');
    await input.press('Enter');
    await expect(page.locator('visual-novel-overlay')).toContainText('二つ目', { timeout: 15000 });

    await page.locator('visual-novel-overlay button[title="ログ"]').click();

    const filter = page.locator('visual-novel-backlog input[placeholder="ログを検索…"]');
    await filter.fill('二つ目');
    await expect(page.locator('visual-novel-backlog [data-vn-log-id]')).toHaveCount(1);
    await filter.fill('');
    await expect(page.locator('visual-novel-backlog [data-vn-log-id]')).toHaveCount(2);

    await page.locator('visual-novel-backlog [data-vn-log-id]').filter({ hasText: '一つ目' }).click();
    await expect(page.locator('visual-novel-overlay')).toContainText('1 / 2');
  });
});
