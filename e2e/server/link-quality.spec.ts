import { openPanel, openSeatWidgets } from '../helpers';
import { createRoom, expect, joinRoom, leaveAll, openSeat, test, uniqueName } from './room-server';

// How the links of a room on the room server are doing, as the connection panel and the link
// quality widget show them: the server is asked when it last heard from each of the others while
// either is open, and its answers to the pings are timed.

const CLOCK = /^\s*\d\d:\d\d:\d\d\s*$/;

test.describe('the links of a room on the room server', () => {
  test('the connection panel shows when the other seat last answered, and the widget how long the server takes', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('通信の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    if (!(await gm.page.locator('peer-menu').isVisible())) await openPanel(gm.page, '接続情報');
    await expect(gm.page.locator('peer-menu').getByTestId('peer-menu-last-answer')).toHaveText(CLOCK, {
      timeout: 20_000,
    });

    const widgets = await openSeatWidgets(gm.page);
    await widgets.getByTestId('seat-widget-connectionQuality').click();
    const rows = gm.page.locator('app-connection-quality').getByTestId('link-quality-row');
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
    await expect(rows.nth(0)).toContainText('部屋のサーバー');
    await expect(rows.nth(0).getByTestId('link-quality-value')).toHaveText(/^\s*\d+ms\s*$/, { timeout: 20_000 });
    await expect(rows.nth(1).getByTestId('link-quality-value')).toHaveText(CLOCK, { timeout: 20_000 });

    await leaveAll(gm, pl);
  });
});
