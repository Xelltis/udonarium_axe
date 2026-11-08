import { expect, type Locator, type Page, test } from '@playwright/test';

import { openPanel, openTableContextMenu, selectVnSpeaker, vnMessageInput, waitAppReady } from './helpers';

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

  test('lets an existing panel (connection info) be used and the table be right-clicked in VN mode', async ({
    page,
  }) => {
    const peerMenu = page.locator('peer-menu');
    await expect(peerMenu).toBeVisible();
    const input = peerMenu.locator('input').first();
    await input.click();
    await expect(input).toBeFocused();

    const menu = await openTableContextMenu(page);
    await expect(menu.getByText('キャラクターを作成')).toBeVisible();
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

  test('moves the log panel by dragging, and resizes it by dragging its edge', async ({ page }) => {
    await page.locator('visual-novel-overlay button[title="ログ"]').click();
    const panel = backlogPanel(page);
    const opened = await settledBox(panel);
    await page.mouse.move(opened.x + 60, opened.y + 14);
    await page.mouse.down();
    await page.mouse.move(opened.x + 60 - 120, opened.y + 14 + 80, { steps: 6 });
    await page.mouse.up();
    const before = await settledBox(panel);
    expect(Math.abs(before.x - opened.x)).toBeGreaterThan(50);

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
});
