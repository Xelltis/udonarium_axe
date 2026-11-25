import { crc32, deflateSync } from 'node:zlib';

import { expect, type Page, test } from '@playwright/test';

import { closePanels, waitAppReady } from '../helpers';

/** A chunk of a PNG file: its length, its kind, its data and the check of the two. */
function chunk(kind: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const named = Buffer.concat([Buffer.from(kind, 'ascii'), data]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(named) >>> 0);
  return Buffer.concat([length, named, check]);
}

/** An APNG of two frames, red and then blue, each standing 300 ms, played over and over. */
function redBlueApng(): Buffer {
  const side = 16;
  const pixels = (rgb: number[]) =>
    deflateSync(Buffer.concat(Array.from({ length: side }, () => Buffer.from([0, ...Array(side).fill(rgb).flat()]))));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const control = (sequence: number) => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence, 0);
    data.writeUInt32BE(side, 4);
    data.writeUInt32BE(side, 8);
    data.writeUInt16BE(30, 20);
    data.writeUInt16BE(100, 22);
    return chunk('fcTL', data);
  };
  const plays = Buffer.alloc(8);
  plays.writeUInt32BE(2, 0);
  const sequence = Buffer.alloc(4);
  sequence.writeUInt32BE(2);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('acTL', plays),
    control(0),
    chunk('IDAT', pixels([255, 0, 0])),
    control(1),
    chunk('fdAT', Buffer.concat([sequence, pixels([0, 0, 255])])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Whether the screen is redder than it is blue at a point. */
async function redAt(page: Page, point: { x: number; y: number }): Promise<boolean> {
  const shot = await page.screenshot({ scale: 'css' });
  return page.evaluate(
    async ({ data, point }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const [r, , b] = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
      return r > b;
    },
    { data: shot.toString('base64'), point }
  );
}

/**
 * A piece wearing a moving picture, an APNG, dropped on the table: the table drawn on a canvas moves
 * it frame by frame, as the page drew it moving before.
 */
test.describe('moving pictures on the table', () => {
  test('moves the APNG a piece dropped on the table wears', async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    const before = await page.evaluate(() => window.__axeTable.sceneStats()?.sprites ?? 0);

    await page.evaluate((png) => {
      const carried = new DataTransfer();
      carried.items.add(
        new File([Uint8Array.from(atob(png), (char) => char.charCodeAt(0))], 'blink.png', { type: 'image/png' })
      );
      const drop = { bubbles: true, cancelable: true, clientX: 640, clientY: 420, dataTransfer: carried };
      document.body.dispatchEvent(new DragEvent('drop', drop));
    }, redBlueApng().toString('base64'));

    await expect
      .poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.sprites ?? 0), { timeout: 15000 })
      .toBeGreaterThan(before);
    await expect.poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.movingPictures ?? 0)).toBe(1);

    const piece = page.locator('game-character').last();
    const identifier = (await piece.getAttribute('data-object-id')) ?? '';
    await expect.poll(() => page.evaluate((id) => window.__axeTable.moving(id), identifier)).toBe(false);
    const box = await page.evaluate((id) => window.__axeTable.pieceBoxesOnPage(id).at(-1) ?? null, identifier);
    expect(box).not.toBeNull();
    const middle = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const seen = new Set<boolean>();
    for (let look = 0; look < 12 && seen.size < 2; look++) {
      seen.add(await redAt(page, middle));
      await page.waitForTimeout(110);
    }

    expect([...seen].sort()).toEqual([false, true]);
  });
});
