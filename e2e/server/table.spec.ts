import { Page } from '@playwright/test';

import { openTableContextMenu, revealMenuEntry } from '../helpers';
import { chatTabText, createRoom, expect, joinRoom, leaveAll, openSeat, say, test, uniqueName } from './room-server';

// What happens on the table of a room on the room server: dice the server rolls, and what it keeps
// back from those who may not see it.

/** The file name of the picture a card shows on this page, such as `z02.webp` for a back. */
async function cardPicture(page: Page): Promise<string> {
  const src = (await page.locator('card img').first().getAttribute('src')) ?? '';
  return src.split('/').pop() ?? '';
}

/** Opens a card's context menu on this page. */
async function openCardMenu(page: Page) {
  await page.locator('card').first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5_000 });
  return menu;
}

const BACK = /^z0\d\.webp$/;
const FRONT = /^([cdhs]\d\d|x0\d)\.webp$/;

test.describe('the table on the room server', () => {
  test('the server rolls dice from the chat, and the result reaches everyone marked as such', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('ダイスの卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    await say(pl.page, '2d6');

    for (const seat of [gm, pl]) {
      await expect(seat.page.getByTestId('chat-message-server-roll').first()).toBeVisible({ timeout: 15_000 });
      expect(await chatTabText(seat.page, 'メイン')).toMatch(/DiceBot : \(2D6\) → \d+/);
    }
    await leaveAll(gm, pl);
  });

  test('a secret dice result shows to the GM but not to a guest', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const guest = await openSeat(browser, roomServer, '見学さん', null);
    const room = uniqueName('シークレットの卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    await joinRoom(guest.page, room);

    await say(pl.page, 's1d100');

    await expect.poll(() => chatTabText(gm.page, 'メイン'), { timeout: 15_000 }).toMatch(/\(1D100\) → \d+/);
    expect(await chatTabText(guest.page, 'メイン')).not.toMatch(/\(1D100\) → \d+/);
    await leaveAll(gm, pl, guest);
  });

  test('a face-down card shows its back to the others, and its face reaches them once the GM turns it up', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('カードの卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    const tableMenu = await openTableContextMenu(gm.page);
    await (await revealMenuEntry(gm.page, tableMenu, 'トランプの山札を作成')).click();
    await gm.page.locator('card-stack').first().dispatchEvent('contextmenu');
    await gm.page.locator('context-menu').getByText('１枚引く').click();
    await expect(gm.page.locator('card')).toHaveCount(1, { timeout: 10_000 });
    const drawnMenu = await openCardMenu(gm.page);
    const faceDown = drawnMenu.getByText('裏にする', { exact: true });
    if (await faceDown.isVisible()) await faceDown.click();
    else await gm.page.keyboard.press('Escape');

    await expect(pl.page.locator('card')).toHaveCount(1, { timeout: 15_000 });
    await expect.poll(() => cardPicture(pl.page), { timeout: 15_000 }).toMatch(BACK);

    await (await openCardMenu(gm.page)).getByText('表にする', { exact: true }).click();

    await expect.poll(() => cardPicture(pl.page), { timeout: 15_000 }).toMatch(FRONT);
    await leaveAll(gm, pl);
  });
});
