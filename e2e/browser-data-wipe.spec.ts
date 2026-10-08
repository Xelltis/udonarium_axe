import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/** Leaves a mark in local storage and in two databases, one of the app's and one of no one's. */
async function leaveMarks(page: Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.setItem('e2e-mark', 'left');
    localStorage.setItem('ui-theme', 'dark');
    const put = (name: string, store: string) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put('mark', 'e2e');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    await put('axe-dice-images', 'images');
    await put('e2e-elsewhere', 'things');
  });
}

/** The marks still there: in local storage, and the databases holding the mark. */
async function marksLeft(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const left: string[] = [];
    if (localStorage.getItem('e2e-mark')) left.push('localStorage');
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const marked = await new Promise<boolean>((resolve) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          const db = request.result;
          const stores = [...db.objectStoreNames];
          if (!stores.length) {
            db.close();
            resolve(false);
            return;
          }
          const get = db.transaction(stores[0], 'readonly').objectStore(stores[0]).get('e2e');
          get.onsuccess = () => {
            db.close();
            resolve(get.result === 'mark');
          };
          get.onerror = () => {
            db.close();
            resolve(false);
          };
        };
        request.onerror = () => resolve(false);
      });
      if (marked) left.push(name);
    }
    return left.sort();
  });
}

async function pressWipe(page: Page): Promise<void> {
  await openPanel(page, '部屋設定');
  const settings = page.locator('room-settings-panel');
  await expect(settings).toBeVisible({ timeout: 15000 });
  await settings.locator('[data-testid="room-settings-tab-utility"]').click();
  await settings.locator('[data-testid="room-settings-wipe-browser-data"]').click();
  await expect(page.locator('confirm-dialog')).toContainText('元には戻せません');
}

test.describe('このブラウザのデータをすべて消す', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await leaveMarks(page);
    expect(await marksLeft(page)).toEqual(['axe-dice-images', 'e2e-elsewhere', 'localStorage']);
  });

  test('消すと読み込み直し、localStorage と IndexedDB の中身が残らないこと', async ({ page }) => {
    await pressWipe(page);
    const reloaded = page.waitForEvent('load');
    await page.locator('confirm-dialog').getByRole('button', { name: 'すべて消して読み込み直す' }).click();
    await reloaded;
    await waitAppReady(page);

    expect(await marksLeft(page)).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('ui-theme'))).not.toBe('dark');
  });

  test('やめると何も消えないこと', async ({ page }) => {
    await pressWipe(page);
    await page.locator('confirm-dialog').getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.locator('confirm-dialog')).toHaveCount(0);

    expect(await marksLeft(page)).toEqual(['axe-dice-images', 'e2e-elsewhere', 'localStorage']);
  });
});
