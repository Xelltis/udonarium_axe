import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { Page } from '@playwright/test';

import { openPanel } from '../helpers';
import { expect, RoomServer } from './room-server';

// What the specs of pictures and sounds on the room server share: watching what a page asks of the
// room's asset store, and pictures no other test uploads.

/** What a page asked of the asset store, and how it was answered. */
export interface AssetCall {
  method: string;
  roomKey: string;
  id: string;
  status: number;
  authorized: boolean;
}

/** The path of one asset of a room on the room server, with the room's key and the asset's hash. */
export const ASSET_PATH = /\/v1\/rooms\/([0-9a-f]{32})\/assets\/([0-9a-f]{64})$/;

/** Records every request a page makes of the room server's asset store. */
export function watchAssets(page: Page, server: RoomServer): AssetCall[] {
  const calls: AssetCall[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    const match = ASSET_PATH.exec(url);
    if (!url.startsWith(server.apiUrl) || !match) return;
    const request = response.request();
    if (request.method() === 'OPTIONS') return;
    calls.push({
      method: request.method(),
      roomKey: match[1],
      id: match[2],
      status: response.status(),
      authorized: (await request.headerValue('authorization'))?.startsWith('Bearer ') ?? false,
    });
  });
  return calls;
}

/** Asks the asset store from outside the browser, as anybody might who learnt a room key and a hash. */
export const askStore = (server: RoomServer, roomKey: string, id: string, authorization?: string) =>
  fetch(`${server.apiUrl}/v1/rooms/${roomKey}/assets/${id}`, {
    method: 'HEAD',
    headers: { Origin: server.appUrl, ...(authorization ? { Authorization: authorization } : {}) },
  });

/** The upload a page made, once it has made one. */
export async function uploadOf(calls: AssetCall[]): Promise<AssetCall> {
  await expect.poll(() => calls.some((call) => call.method === 'PUT'), { timeout: 20_000 }).toBe(true);
  return calls.find((call) => call.method === 'PUT') as AssetCall;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 4x4 PNG of one colour picked at random, so that no two tests upload the same bytes. */
export function uniquePng(): Buffer {
  const [r, g, b] = randomBytes(3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.from([0, ...Array.from({ length: 4 }, () => [r, g, b]).flat()]);
  const pixels = Buffer.concat(Array.from({ length: 4 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 8-bit noise at 8000 samples a second, as a WAV file no other test uploads: a second of it, or as
 * many samples (and so bytes) as asked for.
 */
export function uniqueWav(samples = 8000): Buffer {
  const rate = 8000;
  const data = randomBytes(samples);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate, 16);
  fmt.writeUInt16LE(1, 20);
  fmt.writeUInt16LE(8, 22);
  const dataHeader = Buffer.alloc(8);
  dataHeader.write('data', 0);
  dataHeader.writeUInt32LE(data.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, dataHeader, data]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0);
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

/** Adds a picture from the image panel, opening it first. */
export async function addImage(page: Page, name: string, bytes: Buffer): Promise<void> {
  await openPanel(page, '画像');
  await expect(page.locator('file-storage')).toBeVisible({ timeout: 10_000 });
  await page
    .locator('file-storage input[type="file"][accept="image/*"]')
    .setInputFiles({ name, mimeType: 'image/png', buffer: bytes });
}
