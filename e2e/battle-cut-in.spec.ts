import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** The battle stage the room plays an exchange on: one piece on each side, the bars falling as it lands. */
test.describe('the battle cut-in', () => {
  async function becomeGameMaster(page: Page) {
    await page
      .locator('ui-panel')
      .filter({ hasText: '接続情報' })
      .getByRole('button', { name: /^\s*GM\s*$/ })
      .click();
    await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
  }

  /** Puts キャラクターA on the left and モンスターA on the right of the lineup, as the master. */
  async function setUpLineup(page: Page) {
    await waitAppReady(page);
    await becomeGameMaster(page);
    await openPanel(page, '戦闘カットイン');
    const panel = page.getByTestId('battle-cut-in-panel');
    await expect(panel).toBeVisible({ timeout: 10000 });
    await panel.getByTestId('battle-to-left-キャラクターA').dispatchEvent('click');
    await panel.getByTestId('battle-to-right-モンスターA').dispatchEvent('click');
    await expect(panel.getByTestId('battle-cut-in-bout')).toContainText('キャラクターA → モンスターA');
    return panel;
  }

  test('plays the lineup on this screen, with both sides and their bars, and closes when pressed', async ({ page }) => {
    const panel = await setUpLineup(page);

    await panel.getByTestId('battle-cut-in-play-here').dispatchEvent('click');

    const stage = page.getByTestId('battle-cut-in');
    await expect(stage).toBeVisible({ timeout: 10000 });
    await expect(stage.getByTestId('battle-plate')).toHaveCount(2);
    await expect(stage.getByTestId('battle-plate').first()).toContainText('キャラクターA');
    await expect(stage.getByTestId('battle-plate').last()).toContainText('モンスターA');
    await expect(stage.getByTestId('battle-plate').last()).toContainText('HP');

    await stage.getByTestId('battle-cut-in-close').click();
    await expect(stage).toHaveCount(0);
  });

  test('turns a piece to face across where its picture faces the side it stands on', async ({ page }) => {
    const panel = await setUpLineup(page);
    await panel.getByTestId('battle-effect-piece').selectOption({ label: 'キャラクターA' });
    await panel.getByTestId('battle-facing').selectOption({ label: '左向き' });

    await panel.getByTestId('battle-cut-in-play-here').dispatchEvent('click');

    const stage = page.getByTestId('battle-cut-in');
    await expect(stage).toBeVisible({ timeout: 10000 });
    await expect(stage.locator('img[alt="キャラクターA"]')).toHaveClass(/-scale-x-100/);
    await expect(stage.locator('img[alt="モンスターA"]')).not.toHaveClass(/-scale-x-100/);
  });

  test('closes by itself once the exchange has played', async ({ page }) => {
    const panel = await setUpLineup(page);

    await panel.getByTestId('battle-cut-in-play-here').dispatchEvent('click');

    const stage = page.getByTestId('battle-cut-in');
    await expect(stage).toBeVisible({ timeout: 10000 });
    await expect(stage).toHaveCount(0, { timeout: 15000 });
  });

  test('plays in a small window that leaves the rest of the screen to the table, until its button closes it', async ({
    page,
  }) => {
    const panel = await setUpLineup(page);
    await panel.getByTestId('battle-cut-in-size-choice').selectOption({ label: '小さな窓' });

    await panel.getByTestId('battle-cut-in-play-here').dispatchEvent('click');

    const stage = page.getByTestId('battle-cut-in');
    await expect(stage).toBeVisible({ timeout: 10000 });
    await expect(stage).toHaveAttribute('data-stage-size', 'small');
    const box = (await stage.boundingBox())!;
    const screen = page.viewportSize()!;
    expect(box.width).toBeLessThan(screen.width / 2);
    // The middle of the screen lies outside the window, and a press there reaches the table.
    const reached = await page.evaluate(
      ([x, y]) => !document.elementFromPoint(x, y)?.closest('[data-testid="battle-cut-in"]'),
      [screen.width / 2, screen.height / 2]
    );
    expect(reached).toBe(true);

    await page.keyboard.press('Escape');
    await expect(stage).toBeVisible();
    await stage.getByTestId('battle-cut-in-close').click();
    await expect(stage).toHaveCount(0);
  });

  test('stays off a screen whose reader turned it off', async ({ page }) => {
    const panel = await setUpLineup(page);
    await panel.getByTestId('battle-cut-in-shown').dispatchEvent('click');

    await panel.getByTestId('battle-cut-in-play-here').dispatchEvent('click');

    await expect(page.getByTestId('battle-cut-in')).toHaveCount(0);
  });

  test('shows a change made from the remote controller as the bars fall', async ({ page }) => {
    await waitAppReady(page);
    await page.locator('game-character').filter({ hasText: 'キャラクターA' }).first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('リモコンを表示').click();
    const remote = page.locator('remote-controller');
    await expect(remote).toBeVisible({ timeout: 10000 });

    await remote.getByTestId('remote-target-モンスターA').dispatchEvent('click');
    await remote.locator('label:has(input[name="controller"][value="HP"])').dispatchEvent('click');
    // The amount starts at 0, which is selected so that the typing replaces it.
    const amount = remote.locator('input[name="remote-number"]');
    await amount.focus();
    await amount.press('ControlOrMeta+a');
    await amount.pressSequentially('-5');
    await expect(amount).toHaveValue('-5');
    await remote.getByTestId('remote-battle-on-change').dispatchEvent('click');
    await remote.getByTestId('remote-change-execute').dispatchEvent('click');

    const stage = page.getByTestId('battle-cut-in');
    await expect(stage).toBeVisible({ timeout: 10000 });
    const struck = stage.getByTestId('battle-plate').last();
    await expect(struck).toContainText('モンスターA');
    await expect(stage.getByTestId('battle-pop')).toContainText('-5', { timeout: 5000 });
  });
});
