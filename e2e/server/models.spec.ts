import { randomInt } from 'node:crypto';

import { Page } from '@playwright/test';

import { boxGlb } from '../glb-helpers';
import { uploadOf, watchAssets } from './asset-helpers';
import { createRoom, expect, joinRoom, leaveAll, openSeat, test, uniqueName } from './room-server';

// 3D models on the room server: a GM gives a piece a model read from a .glb file, which goes up to
// the room's assets as pictures and sounds do, and the others take it from there.

/** A box of a colour of its own, so its bytes are like no other run's. */
function uniqueGlb(): Buffer {
  return boxGlb(1, 2, [randomInt(256), randomInt(256), randomInt(256)]);
}

/** Gives the first character on the table a model read from a file, from the settings of its sheet. */
async function giveModel(page: Page, name: string, bytes: Buffer): Promise<void> {
  const piece = page.locator('game-character').first();
  await piece.dispatchEvent('contextmenu');
  await page.locator('context-menu').getByText('詳細を表示').click();
  const sheet = page.locator('game-character-sheet');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await sheet.locator('button:has(i:text-is("settings"))').first().click();
  await sheet.getByTestId('piece-model-file').setInputFiles({ name, mimeType: 'model/gltf-binary', buffer: bytes });
  await expect(sheet.getByTestId('piece-model')).not.toHaveValue('');
}

test.describe('3D models on the room server', () => {
  test('a model a GM gives a piece goes up to the server, and the others take it from there', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('模型の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    const plCalls = watchAssets(pl.page, roomServer);

    await giveModel(gm.page, 'knight.glb', uniqueGlb());

    const upload = await uploadOf(gmCalls);
    expect(upload).toMatchObject({ status: 201, authorized: true });
    await expect
      .poll(() => plCalls.some((call) => call.method === 'GET' && call.id === upload.id && call.status === 200), {
        timeout: 20_000,
      })
      .toBe(true);
    await leaveAll(gm, pl);
  });
});
