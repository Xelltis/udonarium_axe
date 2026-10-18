import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** The tones the chimes of a turn begin on: the signal's two notes, and the tick's one. */
const SIGNAL_LOW_HZ = 880;
const CHIME_HIGH_HZ = 1318.5;

async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await expect(panels).toHaveCount(0);
}

/** Every frequency a tone was set to on this page since it was last read. */
async function tonesSet(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const store = window as unknown as { chimeTones?: number[] };
    const tones = store.chimeTones ?? [];
    store.chimeTones = [];
    return tones;
  });
}

/** Hands the turn on from the round bar of the inventory, opening the inventory first where it is shut. */
async function nextTurn(page: Page) {
  const inventory = page.locator('game-object-inventory');
  if ((await inventory.count()) === 0) await openPanel(page, 'インベントリ');
  await inventory.getByRole('button', { name: /次へ/ }).click();
}

test.describe('the chimes of a turn beginning', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const store = window as unknown as { chimeTones?: number[] };
      store.chimeTones = [];
      const setValueAtTime = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function (value: number, startTime: number) {
        if (value > 100) store.chimeTones?.push(value);
        return setValueAtTime.call(this, value, startTime);
      };
    });
    await waitAppReady(page);
    await becomeGm(page);
    await closePanels(page);
  });

  test('plays nothing for a turn that is not the reader’s own until the master turns the tick on', async ({ page }) => {
    await nextTurn(page);
    await nextTurn(page);
    await page.waitForTimeout(500);
    expect(await tonesSet(page)).not.toContain(CHIME_HIGH_HZ);

    await openPanel(page, '部屋設定');
    const panel = page.locator('room-settings-panel');
    await panel.locator('[data-testid="room-settings-tab-battle"]').click();
    await panel.getByTestId('room-settings-turn-tick').check();
    await closePanels(page);
    await tonesSet(page);

    await nextTurn(page);

    let tones: number[] = [];
    await expect
      .poll(async () => {
        tones = [...tones, ...(await tonesSet(page))];
        return tones.includes(CHIME_HIGH_HZ);
      })
      .toBe(true);
    expect(tones).not.toContain(SIGNAL_LOW_HZ);
  });

  test('shows the two settings to the master in the battle tab, the signal on and the tick off', async ({ page }) => {
    await openPanel(page, '部屋設定');
    const panel = page.locator('room-settings-panel');
    await panel.locator('[data-testid="room-settings-tab-battle"]').click();

    await expect(panel.getByTestId('room-settings-turn-signal')).toBeChecked();
    await expect(panel.getByTestId('room-settings-turn-tick')).not.toBeChecked();
    await expect(panel.getByTestId('room-settings-turn-signal')).toBeEnabled();
  });
});

test.describe('the chimes of a turn beginning, for a player', () => {
  test('shows the two settings without letting a player change them', async ({ page }) => {
    await waitAppReady(page);
    await openPanel(page, '部屋設定');
    const panel = page.locator('room-settings-panel');
    await panel.locator('[data-testid="room-settings-tab-battle"]').click();

    await expect(panel.getByTestId('room-settings-turn-signal')).toBeDisabled();
    await expect(panel.getByTestId('room-settings-turn-tick')).toBeDisabled();
  });
});
