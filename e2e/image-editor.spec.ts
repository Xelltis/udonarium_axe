import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** 1x1 PNG（透明）。上限よりずっと小さい画像として使う。 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/**
 * 無圧縮の 24bit BMP。1000x800 で約 2.4MB になり、上限の 2MB を超える。
 * 中身は単純なグラデーションなので、切り抜いて書き出せば十分小さくなる。
 */
function largeBmp(width = 1000, height = 800): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(54 + pixelBytes, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = 54 + y * rowSize + x * 3;
      buffer[at] = Math.floor((x / width) * 255);
      buffer[at + 1] = Math.floor((y / height) * 255);
      buffer[at + 2] = 128;
    }
  }
  return buffer;
}

async function openFileStorage(page: Page) {
  await waitAppReady(page);
  await openPanel(page, '画像');
  await expect(page.locator('file-storage')).toBeVisible({ timeout: 10000 });
}

function uploadInput(page: Page): Locator {
  return page.locator('file-storage input[type="file"][accept="image/*"]');
}

function editorFrame(page: Page): Locator {
  return page.getByTestId('image-editor-frame');
}

/**
 * 画像が止まったときの位置。パネルは飛び込むアニメーションで開くので、その途中で測ると
 * 枠を引く座標がずれる。終わりのあるアニメーションを待ってから、位置が変わらなくなるまで測る。
 */
async function restingFrame(page: Page) {
  await editorFrame(page).evaluate((element) => {
    const panel = element.closest('.draggable-panel') ?? element;
    const ending = panel
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    return Promise.all(ending.map((animation) => animation.finished.catch(() => undefined)));
  });
  let last = '';
  await expect
    .poll(async () => {
      const box = JSON.stringify(await editorFrame(page).boundingBox());
      const held = box === last;
      last = box;
      return held;
    })
    .toBe(true);
  return JSON.parse(last) as { x: number; y: number; width: number; height: number };
}

/** 画像の範囲の左上寄りから右下寄りへ、本物のマウス操作で枠を引く。 */
async function dragCrop(page: Page) {
  const box = await restingFrame(page);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();
}

test.describe('画像の編集', () => {
  test.beforeEach(async ({ page }) => {
    await openFileStorage(page);
  });

  test('上限以内の画像は編集画面を開かずにそのまま追加されること', async ({ page }) => {
    await uploadInput(page).setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG });

    await expect(page.locator('file-storage img[alt="tiny.png"]')).toHaveCount(1, { timeout: 10000 });
    await expect(editorFrame(page)).toHaveCount(0);
  });

  test('2MB を超える画像は編集画面で開き、切り抜いて追加できること', async ({ page }) => {
    await uploadInput(page).setInputFiles({ name: 'big.bmp', mimeType: 'image/bmp', buffer: largeBmp() });

    await expect(editorFrame(page)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('image-editor-over-limit')).toBeVisible();
    await expect(page.locator('file-storage img[alt="big.bmp"]')).toHaveCount(0);

    await dragCrop(page);
    await expect(page.getByTestId('image-editor-crop')).toBeVisible();
    const width = Number(await page.getByTestId('image-editor-width').inputValue());
    expect(width).toBeGreaterThan(300);
    expect(width).toBeLessThan(700);

    await page.getByTestId('image-editor-add').click();
    await expect(editorFrame(page)).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('file-storage img[alt^="big."]')).toHaveCount(1);
  });

  test('「編集してから追加」にチェックを入れると、小さな画像も編集画面で開くこと', async ({ page }) => {
    await page.getByTestId('file-storage-edit-first').locator('input').check();
    await uploadInput(page).setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG });

    await expect(editorFrame(page)).toBeVisible({ timeout: 10000 });
    await page.getByTestId('image-editor-add').click();

    await expect(editorFrame(page)).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('file-storage img[alt="tiny.png"]')).toHaveCount(1);
  });

  test('チェックした画像を編集で置き換えたあと、続けてもう一度編集できること', async ({ page }) => {
    await uploadInput(page).setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: TINY_PNG });
    const tile = page.locator('file-storage img[alt^="tiny."]');
    await expect(tile).toHaveCount(1, { timeout: 10000 });
    const tiles = await page.locator('file-storage img').count();
    const original = await tile.getAttribute('src');
    await tile.click();
    const edit = page.getByTestId('file-storage-edit');

    for (let round = 0; round < 2; round++) {
      await expect(edit).toBeEnabled();
      await edit.click();
      await expect(editorFrame(page)).toBeVisible({ timeout: 10000 });
      await page.getByTestId('image-editor-turn-right').click();
      await page.getByTestId('image-editor-add').click();
      await expect(editorFrame(page)).toHaveCount(0, { timeout: 10000 });
    }

    // 元の画像は一覧から隠れ、編集した画像が 1 枚だけ並ぶ。書き出しの形式はブラウザによって PNG か WebP になる。
    await expect(page.locator('file-storage img')).toHaveCount(tiles);
    await expect(tile).toHaveCount(1);
    expect(await tile.getAttribute('src')).not.toBe(original);
    await expect(edit).toBeEnabled();
  });
});
