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
  { name: 'Rain.wav', seconds: 6 },
  { name: 'Campfire.wav', seconds: 7 },
];

async function openJukeboxWithTracks(page: Page): Promise<Locator> {
  await waitAppReady(page);
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

async function tagAsBackgroundSound(jukebox: Locator, name: string) {
  await libraryRow(jukebox, name).locator('select').selectOption('BGS');
  await expect(libraryRow(jukebox, name).locator('select option:checked')).toHaveText('環境音');
}

test.describe('ジュークボックスの環境音', () => {
  test('環境音を BGM と重ねて鳴らし、部屋共有の音量を変え、1 本ずつとまとめて止められること', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page);
    await tagAsBackgroundSound(jukebox, 'Rain.wav');
    await tagAsBackgroundSound(jukebox, 'Campfire.wav');

    await libraryRow(jukebox, 'Town.wav').getByTitle('BGM再生').click();
    await libraryRow(jukebox, 'Rain.wav').getByTestId('jukebox-background-toggle').click();
    await libraryRow(jukebox, 'Campfire.wav').getByTestId('jukebox-background-toggle').click();

    const strip = jukebox.getByTestId('jukebox-background-sounds');
    const rows = strip.getByTestId('jukebox-background-sound');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Rain.wav');
    await expect(rows.nth(1)).toContainText('Campfire.wav');
    await expect(jukebox.getByText('Town.wav', { exact: true }).first()).toBeVisible();

    const mini = page.getByTestId('mini-jukebox-background-sounds');
    await expect(mini).toContainText('Rain.wav · Campfire.wav');

    const rainVolume = rows.nth(0).getByTestId('jukebox-background-volume');
    await rainVolume.fill('0.3');
    await expect(rainVolume).toHaveValue('0.3');

    await rows.nth(0).getByTestId('jukebox-background-stop').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText('Campfire.wav');

    await strip.getByTestId('jukebox-background-stop-all').click();
    await expect(strip).toHaveCount(0);
    await expect(mini).toHaveCount(0);
  });

  test('止めた環境音をもう一度鳴らすと、部屋共有の音量が前のまま残っていること', async ({ page }) => {
    const jukebox = await openJukeboxWithTracks(page);
    await tagAsBackgroundSound(jukebox, 'Rain.wav');
    const toggle = libraryRow(jukebox, 'Rain.wav').getByTestId('jukebox-background-toggle');

    await toggle.click();
    const volume = jukebox.getByTestId('jukebox-background-volume');
    await volume.fill('0.25');
    await toggle.click();
    await expect(jukebox.getByTestId('jukebox-background-sounds')).toHaveCount(0);

    await toggle.click();
    await expect(volume).toHaveValue('0.25');
  });
});
