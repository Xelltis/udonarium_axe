import { deflateSync } from 'node:zlib';

import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** A picture of one colour, wide enough that a backdrop's shift is not folded away to nothing. */
function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PICTURES = [
  { name: 'far-hills.png', buffer: solidPng(400, 60, [90, 80, 140]) },
  { name: 'near-town.png', buffer: solidPng(400, 40, [40, 44, 70]) },
];

async function becomeGameMaster(page: Page) {
  const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
  await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();
  await expect(page.locator('app-gm-toolbar [title^="暗闇"]')).toBeVisible({ timeout: 10000 });
}

async function standBehind(settings: Locator, index: number, picture: string) {
  await settings.getByTestId('background-layer-placement').nth(index).selectOption('backdrop');
  await settings.getByTestId('background-layer-image').nth(index).click();
  const picker = settings.page().locator('file-selector');
  await expect(picker).toBeVisible();
  if ((await picker.locator(`img[alt="${picture}"]`).count()) === 0) {
    await picker
      .locator('input[type="file"]')
      .setInputFiles(PICTURES.map((made) => ({ name: made.name, mimeType: 'image/png', buffer: made.buffer })));
  }
  await picker.locator(`img[alt="${picture}"]`).click();
  await expect(picker).toHaveCount(0);
}

test.describe('背景レイヤーの「奥」', () => {
  test('奥のレイヤーは、カメラへの反応が大きいほど視点の移動について大きく動くこと', async ({ page }) => {
    await waitAppReady(page);
    await becomeGameMaster(page);
    await openPanel(page, 'テーブル設定');
    const settings = page.locator('game-table-setting');
    await expect(settings).toBeVisible({ timeout: 10000 });

    await settings.getByTestId('background-layer-add').click();
    await settings.getByTestId('background-layer-add').click();
    await standBehind(settings, 0, 'far-hills.png');
    await standBehind(settings, 1, 'near-town.png');
    await settings.getByTestId('background-layer-follow').nth(0).fill('10');
    await settings.getByTestId('background-layer-follow').nth(1).fill('60');

    const follows = page.getByTestId('backdrop-layer-follow');
    await expect(follows).toHaveCount(2);
    await page.keyboard.press('Escape');
    const shifts = async () =>
      follows.evaluateAll((elements) =>
        elements.map((element) => Number(/translate3d\(([-\d.]+)px/.exec(element.style.transform)?.[1] ?? NaN))
      );
    const before = await shifts();

    const viewport = page.viewportSize()!;
    const at = { x: viewport.width - 120, y: viewport.height - 80 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 100, at.y, { steps: 8 });
    await page.mouse.up();

    await expect.poll(shifts).not.toEqual(before);
    const after = await shifts();
    // A shift is folded into one picture's width, so a small move back reads as nearly a whole picture.
    const width = 400;
    const moved = after.map((shift, index) => {
      const step = (((shift - before[index]) % width) + width) % width;
      return Math.min(step, width - step);
    });
    expect(moved[1]).toBeGreaterThan(moved[0]);
  });
});
