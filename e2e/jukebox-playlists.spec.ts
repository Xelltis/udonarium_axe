import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** Seconds of 8-bit silence as a WAV file. Lengths differ per track, so each file is a sound of its own. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(Math.round(seconds * rate), 128);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const TRACKS = [
  { name: 'Town.wav', seconds: 20 },
  { name: 'Battle.wav', seconds: 21 },
  { name: 'Boss.wav', seconds: 22 },
];

async function becomeRole(page: Page, role: 'GM' | 'PL' | '見学'): Promise<void> {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) })
    .click();
}

/**
 * Opens the jukebox with the tracks loaded, taking a role first when one is given; the connection
 * panel comes to the front when its role buttons are pressed, so it is done before the jukebox opens.
 */
async function openJukeboxWithTracks(page: Page, role?: 'GM' | 'PL' | '見学'): Promise<Locator> {
  await waitAppReady(page);
  if (role) await becomeRole(page, role);
  await openPanel(page, 'ジュークボックス');
  const jukebox = page.locator('app-jukebox');
  await expect(jukebox).toBeVisible({ timeout: 10000 });
  await jukebox
    .locator('input[type="file"][accept="audio/*"]')
    .setInputFiles(
      TRACKS.map((track) => ({ name: track.name, mimeType: 'audio/wav', buffer: silentWav(track.seconds) }))
    );
  for (const track of TRACKS) {
    await expect(jukebox.getByText(track.name, { exact: true })).toBeVisible({ timeout: 15000 });
  }
  return jukebox;
}

function libraryRow(jukebox: Locator, name: string): Locator {
  return jukebox
    .locator('div.border-b')
    .filter({ has: jukebox.page().locator('select') })
    .filter({ has: jukebox.page().getByText(name, { exact: true }) });
}

function chip(jukebox: Locator, label: string): Locator {
  return jukebox.getByTestId('jukebox-playlist-chip').filter({ hasText: label });
}

/** Makes a playlist named so from the playlist tab, and leaves it shown. */
async function makePlaylist(jukebox: Locator, name: string) {
  await jukebox.getByTestId('jukebox-tab-playlist').click();
  await jukebox.getByTestId('jukebox-playlist-create').click();
  const nameInput = jukebox.getByTestId('jukebox-playlist-name');
  // The box takes the new playlist's stand-in name on the next redraw, which would write over a
  // name typed before it.
  await expect(nameInput).toHaveValue(/^再生リスト \d+$/);
  await nameInput.fill(name);
  await nameInput.press('Enter');
  await nameInput.blur();
  await expect(chip(jukebox, name)).toHaveAttribute('aria-pressed', 'true');
}

/** Puts library tracks on the playlist shown in the playlist tab. */
async function addFromLibrary(jukebox: Locator, ...names: string[]) {
  await jukebox.getByTestId('jukebox-tab-library').click();
  for (const name of names) {
    await libraryRow(jukebox, name).locator('button', { hasText: 'playlist_add' }).click();
  }
  await jukebox.getByTestId('jukebox-tab-playlist').click();
}

test.describe('ジュークボックスの再生リスト', () => {
  test('再生リストを作って名前を付け、ライブラリの曲をその再生リストに入れられること', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page);

    await makePlaylist(jukebox, '戦闘');
    await addFromLibrary(jukebox, 'Battle.wav', 'Boss.wav');

    await expect(chip(jukebox, '戦闘')).toContainText('2');
    await expect(chip(jukebox, 'メイン')).toContainText('0');
    await expect(jukebox.getByText('Boss.wav', { exact: true })).toBeVisible();
  });

  test('右クリックで曲を別の再生リストへ移せること', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page);
    await makePlaylist(jukebox, '戦闘');
    await addFromLibrary(jukebox, 'Battle.wav');

    await jukebox.locator('[draggable="true"]').filter({ hasText: 'Battle.wav' }).click({ button: 'right' });
    const menu = page.locator('context-menu');
    await menu.getByText('別の再生リストへ移す', { exact: true }).click();
    await menu.getByText('メイン', { exact: true }).click();

    await expect(chip(jukebox, '戦闘')).toContainText('0');
    await expect(chip(jukebox, 'メイン')).toContainText('1');
  });

  test('ミニプレイヤーで次の再生リストへ移ると、その再生リストの最初の曲が流れること', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page);
    await jukebox.getByTestId('jukebox-tab-playlist').click();
    await addFromLibrary(jukebox, 'Town.wav');
    await makePlaylist(jukebox, '戦闘');
    await addFromLibrary(jukebox, 'Battle.wav', 'Boss.wav');

    const mini = page.locator('app-mini-jukebox');
    await mini.getByRole('button', { name: 'queue_music' }).click();
    await expect(mini.getByTestId('mini-jukebox-playlist-name')).toHaveText('メイン');
    await mini.getByTestId('mini-jukebox-next-playlist').click();

    await expect(mini.getByTestId('mini-jukebox-playlist-name')).toHaveText('戦闘');
    await expect(mini.getByText('Battle.wav').first()).toBeVisible();
    await expect(jukebox.getByTestId('jukebox-active-playlist')).toHaveText('戦闘');
    await expect(chip(jukebox, '戦闘').locator('.material-icons', { hasText: 'volume_up' })).toBeVisible();
  });

  test('一時停止すると位置を残して止まり、もう一度押すとそこから続くこと', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page);
    await jukebox.getByTestId('jukebox-tab-playlist').click();
    await addFromLibrary(jukebox, 'Town.wav', 'Battle.wav');
    await jukebox.getByTestId('jukebox-playlist-play').click();
    const playPause = jukebox.getByTestId('jukebox-play-pause');
    await expect(playPause).toHaveAttribute('title', '一時停止');

    await playPause.click();

    await expect(playPause).toHaveAttribute('title', '再生');
    await expect(jukebox.getByText('一時停止中')).toBeVisible();
    await expect(jukebox.getByTestId('jukebox-time')).not.toHaveText('—');

    await playPause.click();

    await expect(playPause).toHaveAttribute('title', '一時停止');
    await expect(jukebox.getByText('一時停止中')).toHaveCount(0);
  });

  test('シャッフルとリピートが部屋全体の設定として、パネルとミニプレイヤーの両方に出ること', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page, 'GM');
    const mini = page.locator('app-mini-jukebox');

    await jukebox.getByTestId('jukebox-shuffle').click();
    await expect(jukebox.getByTestId('jukebox-shuffle')).toHaveAttribute('aria-pressed', 'true');
    await expect(mini.getByTestId('mini-jukebox-shuffle')).toHaveAttribute('aria-pressed', 'true');

    await mini.getByTestId('mini-jukebox-shuffle').click();
    await expect(jukebox.getByTestId('jukebox-shuffle')).toHaveAttribute('aria-pressed', 'false');

    const repeat = jukebox.getByTestId('jukebox-repeat');
    await expect(repeat).toHaveAttribute('title', '1曲リピート');
    await repeat.click();
    await expect(repeat).toHaveAttribute('title', 'リピートなし');
    await repeat.click();
    await expect(repeat).toHaveAttribute('title', '再生リストをリピート');
  });

  test('シャッフルとリピートを変えたGMの名前がシステムログに残ること', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page, 'GM');

    await jukebox.getByTestId('jukebox-shuffle').click();
    await jukebox.getByTestId('jukebox-repeat').click();
    // The jukebox panel lies over the chat's tabs, so the tab is chosen without a pointer.
    await page
      .locator('chat-window label')
      .filter({ hasText: /^\s*システム\s*\d*\s*$/ })
      .first()
      .locator('input[type="radio"]')
      .dispatchEvent('click');

    const chat = page.locator('chat-window');
    await expect(chat).toContainText('さんがジュークボックスのシャッフルをオンにしました。');
    await expect(chat).toContainText('さんがジュークボックスのリピートを解除しました。');
  });

  test('プレイヤーはシャッフルとリピートを変えられず、見学は再生も止められないこと', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page, 'PL');
    const mini = page.locator('app-mini-jukebox');
    await jukebox.getByTestId('jukebox-tab-playlist').click();
    await addFromLibrary(jukebox, 'Town.wav', 'Battle.wav');
    await jukebox.getByTestId('jukebox-playlist-play').click();
    await expect(jukebox.getByTestId('jukebox-play-pause')).toHaveAttribute('title', '一時停止');

    await expect(jukebox.getByTestId('jukebox-play-pause')).toBeEnabled();
    for (const button of [
      jukebox.getByTestId('jukebox-shuffle'),
      jukebox.getByTestId('jukebox-repeat'),
      mini.getByTestId('mini-jukebox-shuffle'),
      mini.getByTestId('mini-jukebox-repeat'),
    ]) {
      await expect(button).toBeDisabled();
    }
    await expect(jukebox.getByTestId('jukebox-repeat')).toHaveAttribute('title', /GM だけが変えられます/);

    await becomeRole(page, '見学');
    await expect(jukebox.getByTestId('jukebox-play-pause')).toBeDisabled();
    await expect(jukebox.getByTestId('jukebox-next')).toBeDisabled();
    await expect(mini.getByTestId('mini-jukebox-play-pause')).toBeDisabled();
    await expect(jukebox.getByTestId('jukebox-play-pause')).toHaveAttribute('title', '一時停止');
  });
});
