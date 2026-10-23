import { Page } from '@playwright/test';

import { openPanel } from '../helpers';
import { addImage, uniquePng, uniqueWav, uploadOf, watchAssets } from './asset-helpers';
import { assetIdOf, createRoom, expect, joinRoom, leaveAll, openSeat, test, uniqueName } from './room-server';

// A player removing the pictures and sounds they added, which the room server lets through for them
// alone, and a tag of pictures kept to the player who locked it.

/** The picture of that name in the image panel. */
const pictureIn = (page: Page, name: string) => page.locator(`file-storage img[alt="${name}"]`);

/** The pill of that tag at the top of the image panel. */
const tagIn = (page: Page, tag: string) => page.locator('file-storage label').filter({ hasText: tag });

/** The row of the jukebox's library that names the sound. */
const soundRowIn = (page: Page, name: string) =>
  page
    .locator('app-jukebox div.border-b')
    .filter({ has: page.locator('select') })
    .filter({ has: page.getByText(name, { exact: true }) });

test.describe('what a player added, and a tag kept to one', () => {
  test.setTimeout(180_000);

  test('a player removes the picture they added and keeps the GM’s, and one who added none is offered no way', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const other = await openSeat(browser, roomServer, 'ほかのPLさん');
    const room = uniqueName('自分の画像を消す卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    await joinRoom(other.page, room);
    const gmCalls = watchAssets(gm.page, roomServer);
    const plCalls = watchAssets(pl.page, roomServer);
    const mine = uniquePng();
    const id = assetIdOf(mine);

    await addImage(gm.page, 'gms.png', uniquePng());
    await uploadOf(gmCalls);
    await addImage(pl.page, 'mine.png', mine);
    await uploadOf(plCalls);
    await openPanel(other.page, '画像');
    await expect(pictureIn(other.page, 'mine.png')).toBeVisible({ timeout: 20_000 });
    await expect(pictureIn(pl.page, 'gms.png')).toBeVisible({ timeout: 20_000 });
    await expect(other.page.getByTestId('file-storage-remove')).toHaveCount(0);

    await pictureIn(pl.page, 'mine.png').locator('xpath=..').click();
    await pictureIn(pl.page, 'gms.png').locator('xpath=..').click();
    await pl.page.getByTestId('file-storage-remove').click();
    await expect(pl.page.getByText('ほかの人が上げた1件は削除せずに残ります。')).toBeVisible();
    await pl.page.getByRole('button', { name: '削除する' }).click();

    await expect(pl.page.getByText('1件の画像を削除しました')).toBeVisible({ timeout: 10_000 });
    await expect(pictureIn(other.page, 'mine.png')).toHaveCount(0, { timeout: 15_000 });
    await expect(pictureIn(gm.page, 'mine.png')).toHaveCount(0, { timeout: 15_000 });
    await expect(pictureIn(other.page, 'gms.png')).toBeVisible();
    await expect
      .poll(() => plCalls.some((call) => call.method === 'DELETE' && call.id === id && call.status === 204), {
        timeout: 15_000,
      })
      .toBe(true);
    await leaveAll(gm, pl, other);
  });

  test('a player is offered to remove the sound they added and not the GM’s', async ({ browser, roomServer }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const room = uniqueName('自分の音を消す卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);

    await openPanel(gm.page, 'ジュークボックス');
    await gm.page
      .locator('app-jukebox input[type="file"][accept="audio/*"]')
      .setInputFiles({ name: 'gms.wav', mimeType: 'audio/wav', buffer: uniqueWav() });
    await openPanel(pl.page, 'ジュークボックス');
    await pl.page
      .locator('app-jukebox input[type="file"][accept="audio/*"]')
      .setInputFiles({ name: 'mine.wav', mimeType: 'audio/wav', buffer: uniqueWav() });
    await expect(soundRowIn(pl.page, 'gms.wav')).toBeVisible({ timeout: 20_000 });
    await expect(soundRowIn(pl.page, 'gms.wav').getByTestId('jukebox-remove')).toHaveCount(0);

    await soundRowIn(pl.page, 'mine.wav').getByTestId('jukebox-remove').click();
    await pl.page.getByRole('button', { name: '削除する' }).click();

    await expect(pl.page.getByText('1件の音声を削除しました')).toBeVisible({ timeout: 10_000 });
    await expect(soundRowIn(gm.page, 'mine.wav')).toHaveCount(0, { timeout: 15_000 });
    await expect(soundRowIn(gm.page, 'gms.wav')).toBeVisible();
    await leaveAll(gm, pl);
  });

  test('a tag a player keeps to themselves leaves the lists of other players, not the GM’s, until it is let go', async ({
    browser,
    roomServer,
  }) => {
    const gm = await openSeat(browser, roomServer, 'GMさん');
    const pl = await openSeat(browser, roomServer, 'PLさん');
    const other = await openSeat(browser, roomServer, 'ほかのPLさん');
    const room = uniqueName('自分専用の卓');
    await createRoom(gm.page, room);
    await joinRoom(pl.page, room);
    await joinRoom(other.page, room);
    const plCalls = watchAssets(pl.page, roomServer);

    await addImage(pl.page, 'secret.png', uniquePng());
    await uploadOf(plCalls);
    await pictureIn(pl.page, 'secret.png').locator('xpath=..').click();
    await pl.page.getByPlaceholder('新タグ名').fill('ひみつ');
    await pl.page.getByRole('button', { name: 'タグを変更' }).click();
    await openPanel(other.page, '画像');
    await openPanel(gm.page, '画像');
    await expect(tagIn(other.page, 'ひみつ')).toBeVisible({ timeout: 20_000 });
    // Every picture, so that one kept out shows by its absence.
    await tagIn(other.page, '全て').click();
    await tagIn(gm.page, '全て').click();
    await expect(pictureIn(other.page, 'secret.png')).toBeVisible();

    await tagIn(pl.page, 'ひみつ').click();
    await pl.page.getByTestId('file-storage-lock-tag').click();

    await expect(tagIn(pl.page, 'ひみつ').getByTestId('file-storage-tag-locked')).toBeVisible();
    await expect(tagIn(other.page, 'ひみつ')).toHaveCount(0, { timeout: 15_000 });
    await expect(pictureIn(other.page, 'secret.png')).toHaveCount(0);
    await expect(tagIn(gm.page, 'ひみつ').getByTestId('file-storage-tag-locked')).toBeVisible({ timeout: 15_000 });
    await expect(pictureIn(gm.page, 'secret.png')).toBeVisible();

    await pl.page.getByTestId('file-storage-lock-tag').click();

    await expect(tagIn(other.page, 'ひみつ')).toBeVisible({ timeout: 15_000 });
    await expect(pictureIn(other.page, 'secret.png')).toBeVisible();
    await leaveAll(gm, pl, other);
  });
});
