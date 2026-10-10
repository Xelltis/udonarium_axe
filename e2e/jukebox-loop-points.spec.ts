import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * Six seconds of 16-bit silence at 8000 samples a second, as a WAV file whose sampler chunk asks
 * for the part from one second to three to go round, or with no sampler chunk at all.
 */
function wav(loop: boolean): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * 6 * 2);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * 2, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  const smpl = Buffer.alloc(loop ? 8 + 60 : 0);
  if (loop) {
    smpl.write('smpl', 0);
    smpl.writeUInt32LE(60, 4);
    smpl.writeUInt32LE(1, 8 + 28);
    smpl.writeUInt32LE(rate, 8 + 44);
    smpl.writeUInt32LE(rate * 3 - 1, 8 + 48);
  }
  const dataHeader = Buffer.alloc(8);
  dataHeader.write('data', 0);
  dataHeader.writeUInt32LE(data.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, smpl, dataHeader, data]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0);
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

async function playOnRepeatOne(page: Page, name: string, loop: boolean): Promise<Locator> {
  await waitAppReady(page);
  await openPanel(page, 'ジュークボックス');
  const jukebox = page.locator('app-jukebox');
  await expect(jukebox).toBeVisible({ timeout: 10000 });
  await jukebox
    .locator('input[type="file"][accept="audio/*"]')
    .setInputFiles([{ name, mimeType: 'audio/wav', buffer: wav(loop) }]);
  const row = jukebox
    .locator('div.border-b')
    .filter({ has: page.locator('select') })
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(jukebox.getByTestId('jukebox-repeat').locator('.material-icons')).toHaveText('repeat_one');
  await row.getByTitle('BGM再生').click();
  return jukebox;
}

/**
 * The whole seconds the jukebox shows the track at, read every quarter second until `enough` says
 * what has been seen will do, or 20 seconds have gone. How fast the track plays depends on how busy
 * the machine is, so the reading goes on until it has seen what it needs rather than for a set time.
 */
async function shownSeconds(jukebox: Locator, enough: (seen: number[]) => boolean): Promise<number[]> {
  const seen: number[] = [];
  const time = jukebox.getByTestId('jukebox-time');
  await expect(time).toHaveText(/^0:0\d \/ 0:06$/, { timeout: 10000 });
  for (const until = Date.now() + 20_000; Date.now() < until && !enough(seen);) {
    const match = /^0:0(\d) \//.exec((await time.textContent()) ?? '');
    if (match) seen.push(Number(match[1]));
    await jukebox.page().waitForTimeout(250);
  }
  return seen;
}

/** Whether the shown time went back from the end of the loop to its start. */
const wrapped = (seen: number[]) => seen.some((second, i) => i > 0 && seen[i - 1] >= 2 && second <= 1);

test.describe('ジュークボックスのループ位置', () => {
  test('ループ位置のある曲は、1曲ループで指定の区間をくり返すこと', async ({ page }) => {
    const jukebox = await playOnRepeatOne(page, 'Looped.wav', true);

    const seen = await shownSeconds(jukebox, (sofar) => wrapped(sofar) || sofar.some((second) => second > 3));

    expect(Math.max(...seen)).toBeLessThanOrEqual(3);
    expect(wrapped(seen)).toBe(true);
  });

  test('ループ位置のない曲は、これまでどおり曲の最後まで流れること', async ({ page }) => {
    const jukebox = await playOnRepeatOne(page, 'Plain.wav', false);

    const seen = await shownSeconds(jukebox, (sofar) => sofar.some((second) => second >= 4));

    expect(Math.max(...seen)).toBeGreaterThanOrEqual(4);
  });
});
