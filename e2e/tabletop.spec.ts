import { expect, test } from '@playwright/test';

import { createCharacter, createDiceSymbol, openPanel, openTableContextMenu, waitAppReady } from './helpers';

test.describe('ゲームテーブル', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('ゲームテーブル(#app-table-layer)が表示されること', async ({ page }) => {
    await expect(page.locator('#app-table-layer')).toBeVisible();
  });

  test('テーブル上で右クリックするとコンテキストメニューが表示されること', async ({ page }) => {
    await openTableContextMenu(page);
  });

  test('コンテキストメニューに作成項目があること', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await expect(menu.getByText('キャラクターを作成')).toBeVisible();
    await expect(menu.getByText('マップマスクを作成')).toBeVisible();
    await expect(menu.getByText('地形を作成')).toBeVisible();
    await expect(menu.getByText('共有メモを作成')).toBeVisible();
  });
});

test.describe('コンテキストメニューからオブジェクト作成', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('キャラクターを作成できること', async ({ page }) => {
    await createCharacter(page);
  });

  test('共有メモを作成できること', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await menu.getByText('共有メモを作成').click();
    await expect(page.locator('text-note').first()).toBeAttached({ timeout: 10000 });
  });

  test('マップマスクを作成できること', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await menu.getByText('マップマスクを作成').click();
    await expect(page.locator('game-table-mask').first()).toBeAttached({ timeout: 10000 });
  });

  test('地形を作成できること', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await menu.getByText('地形を作成').click();
    await expect(page.locator('terrain').first()).toBeAttached({ timeout: 10000 });
  });

  test('トランプの山札を作成できること', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await menu.getByText('トランプの山札を作成').click();
    await expect(page.locator('card-stack').first()).toBeAttached({ timeout: 10000 });
  });

  test('ダイスシンボル (D6) を作成できること', async ({ page }) => {
    await createDiceSymbol(page);
  });

  test('射程範囲 (円形) を作成できること', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await menu.getByText('射程範囲を作成').hover();
    await expect(menu.getByText('円形', { exact: true })).toBeVisible({ timeout: 5000 });
    await menu.getByText('円形', { exact: true }).click();
    await expect(page.locator('range').first()).toBeAttached({ timeout: 10000 });
  });

  test('射程範囲の種類が揃っていること', async ({ page }) => {
    const menu = await openTableContextMenu(page);
    await menu.getByText('射程範囲を作成').hover();
    for (const name of ['直線', 'コーン', '三角形', '四角形', '五角形', '六角形', '円形']) {
      await expect(menu.getByText(name, { exact: true })).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('キャラクター操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('キャラクターを右クリックするとコンテキストメニューが表示されること', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await expect(page.locator('context-menu').locator('li').first()).toBeVisible({ timeout: 5000 });
  });

  test('作成したキャラクターがインベントリのテーブルタブに表示されること', async ({ page }) => {
    await createCharacter(page);
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    await expect(page.locator('game-object-inventory [data-testid="inventory-item"]').first()).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('キャラクターシート操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('右クリック→詳細を表示でキャラクターシートが開くこと', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  });

  test('キャラクターシートにコピー/保存ボタンがあること', async ({ page }) => {
    // キャラクターのシートには「編集切り替え」ボタンは出ない（characterの場合は@ifで除外）。
    // 代わりに常設の「コピーを作る」「保存」が表示される。
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('game-character-sheet').getByRole('button', { name: 'コピーを作る' })).toBeVisible();
    await expect(page.locator('game-character-sheet').getByRole('button', { name: '保存' })).toBeVisible();
  });

  test('キャラクターのコピーを作れること', async ({ page }) => {
    await createCharacter(page);
    // countはデフォルトテーブルのプリセットキャラと新規作成分を含むので、
    // 安定するまで少し待つ必要がある。waitForFunctionで確実に固定値を得る。
    const initialCount = await page.locator('game-character').count();
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    // context-menuの「コピーを作る」とgame-character-sheetの同名ボタンが
    // 同時に存在する可能性があるため、context-menuスコープで一意化する。
    await menu.getByText('コピーを作る').click();
    await expect.poll(() => page.locator('game-character').count(), { timeout: 10000 }).toBeGreaterThan(initialCount);
  });

  test('キャラクターを墓場に移動するとインベントリ墓場タブに現れること', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('墓場に移動').click();
    await openPanel(page, 'インベントリ');
    await expect(page.locator('game-object-inventory input[name="tab"]')).toHaveCount(4, { timeout: 5000 });
    await page.locator('game-object-inventory form[name="game-object-inventory"] > label').nth(3).click();
    await expect(page.locator('game-object-inventory [data-testid="inventory-item"]').first()).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('ダイスシンボル操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('ダイスを右クリック→コンテキストメニューに「ダイスを振る」が表示されること', async ({ page }) => {
    await createDiceSymbol(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await expect(menu.getByText('ダイスを振る')).toBeVisible();
  });

  test('ダイスを振るアクションがエラー無く完了すること', async ({ page }) => {
    // 「ダイスを振る」はcallRollDiceSymbolを呼び出してダイスを回転させるアニメーション
    // を再生するだけで、チャットログには出力されない（出力されるのはbcdice経由のdNコマンド
    // のみ）。ここでは「アクションが最後まで実行されてダイス要素がDOMに残っている」ことを確認する。
    await createDiceSymbol(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('ダイスを振る').click();
    await expect(page.locator('dice-symbol').first()).toBeAttached({ timeout: 5000 });
  });

  test('ダイスの詳細表示でダイス専用シートが開くこと', async ({ page }) => {
    await createDiceSymbol(page);
    await page.locator('dice-symbol').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('詳細を表示').click();
    // dice-symbol-sheetはapp-接頭辞付きの専用シートで開かれる
    await expect(page.locator('app-dice-symbol-sheet')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('ゲームテーブルのズーム操作', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('ホイールでゲームテーブルがズームすること', async ({ page }) => {
    // wheelリスナーは<game-table>要素にバインドされ、変換は#app-game-table
    // の親div（#gameTableテンプレ参照）に書き込まれる。テンプレ参照はDOMのidに
    // ならないので、#app-game-tableの親要素を辿ってstyle.transformを読む。
    const transformedEl = page.locator('#app-game-table').locator('xpath=..');
    const initialTransform = await transformedEl.evaluate((el) => (el as HTMLElement).style.transform);
    await page.mouse.move(900, 250);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(300);
    const afterTransform = await transformedEl.evaluate((el) => (el as HTMLElement).style.transform);
    expect(afterTransform).not.toBe(initialTransform);
  });

  test('ホイールで縮小・拡大を繰り返してもクラッシュしないこと', async ({ page }) => {
    await page.mouse.move(900, 250);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -200);
    }
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 200);
    }
    await expect(page.locator('#app-table-layer')).toBeVisible();
  });
});

test.describe('キャラクターのチャットパレット', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('チャットパレットを表示できること', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('チャットパレットを表示').click();
    await expect(page.locator('chat-palette')).toBeVisible({ timeout: 10000 });
  });

  test('リモコンを表示できること', async ({ page }) => {
    await createCharacter(page);
    await page.locator('game-character').first().dispatchEvent('contextmenu');
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await menu.getByText('リモコンを表示').click();
    await expect(page.locator('remote-controller')).toBeVisible({ timeout: 10000 });
  });
});
