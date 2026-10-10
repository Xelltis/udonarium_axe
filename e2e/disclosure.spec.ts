import { expect, Page, test } from '@playwright/test';

import { openPanel, waitAppReady } from './helpers';

/**
 * 公開範囲は「見えてはいけないものが見えない」ことの機能なので、おかしくなっても
 * 画面上は何も起きず気づけない。GMが隠した対象がPLの手元でどうなるかを、
 * 公開のままのコマと見比べて確かめる。
 */
test.describe('情報の公開範囲', () => {
  const HIDDEN = 0;
  const PUBLIC = 1;

  async function setRole(page: Page, role: 'GM' | 'PL' | '見学') {
    const panel = page.locator('ui-panel').filter({ hasText: '接続情報' });
    await panel.getByRole('button', { name: new RegExp(`^\\s*${role}\\s*$`) }).click();
    // ロールが行き渡るとツールバーが差し替わる。
    const toolbar = role === 'GM' ? 'app-gm-toolbar [title^="暗闇"]' : 'app-pl-toolbar [title="所有キャラクター一覧"]';
    if (role !== '見学') await expect(page.locator(toolbar)).toBeVisible({ timeout: 10000 });
  }

  const pieceName = (page: Page, index: number) =>
    page.locator('game-character').nth(index).locator('[data-testid="piece-name"]').innerText();

  /** パネルの閉じるボタンは浮いているツールバーの下に入るので、イベントを直接送る。 */
  async function closePanel(page: Page, title: string) {
    await page
      .locator('ui-panel')
      .filter({ hasText: title })
      .locator('button')
      .filter({ hasText: /^\s*close\s*$/ })
      .first()
      .dispatchEvent('click');
    await expect(page.locator('ui-panel').filter({ hasText: title })).toHaveCount(0, { timeout: 5000 });
  }

  /** メニューは外側のmousedownで閉じる。Escapeでは閉じない。 */
  async function dismissMenu(page: Page) {
    await page.locator('#app-table-layer').click({ position: { x: 40, y: 640 } });
    await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
  }

  async function openSheet(page: Page, index: number) {
    await page.locator('game-character').nth(index).dispatchEvent('contextmenu');
    await page.locator('context-menu li').filter({ hasText: '詳細を表示' }).click();
    await expect(page.locator('game-character-sheet')).toBeVisible({ timeout: 10000 });
  }

  /** GMとして1体を「GMのみ」にし、その名前を返す。 */
  async function hidePiece(page: Page, index: number) {
    const name = await pieceName(page, index);
    await openSheet(page, index);
    await page.locator('disclosure-control').getByRole('button', { name: 'GMのみ' }).click();
    await closePanel(page, 'キャラクターシート');
    return name;
  }

  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await setRole(page, 'GM');
  });

  test('「GMのみ」にしたコマは PL からは触れなくなること', async ({ page }) => {
    const total = await page.locator('game-character').count();
    await hidePiece(page, HIDDEN);
    await setRole(page, 'PL');

    // 公開のままのコマはこれまでどおり開ける。ここが通ることで、次の
    // 「メニューが出ない」が描画待ちではなく本当に出ないことだと言える。
    await page.locator('game-character').nth(PUBLIC).dispatchEvent('contextmenu');
    await expect(page.locator('context-menu li').filter({ hasText: '詳細を表示' })).toBeVisible({ timeout: 5000 });
    await dismissMenu(page);

    // 隠したコマはメニューそのものが開かない。
    await page.locator('game-character').nth(HIDDEN).dispatchEvent('contextmenu');
    await expect(page.locator('context-menu')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator('context-menu')).toHaveCount(0);

    // 消えるわけではなく、卓上には残る。
    await expect(page.locator('game-character')).toHaveCount(total);
  });

  test('インベントリでは非公開のコマに錠前が付くこと', async ({ page }) => {
    const hidden = await hidePiece(page, HIDDEN);
    const shown = await pieceName(page, PUBLIC);
    await setRole(page, 'PL');

    await openPanel(page, 'インベントリ');
    const inventory = page.locator('game-object-inventory');
    await expect(inventory).toBeVisible({ timeout: 10000 });

    // 名前は残る（存在は分かる）が、錠前が付いて中身は開けない。
    await expect(inventory).toContainText(hidden);
    await expect(inventory).toContainText(shown);
    await expect(inventory.locator('i.material-icons', { hasText: 'lock' })).toHaveCount(1);
  });

  test('GM は自分が隠したコマを引き続き開けること', async ({ page }) => {
    const hidden = await hidePiece(page, HIDDEN);
    await openSheet(page, HIDDEN);
    await expect(page.locator('ui-panel').filter({ hasText: 'キャラクターシート' })).toContainText(hidden);
  });

  test('公開範囲の切り替えは GM にだけ出ること', async ({ page }) => {
    await page.locator('game-character').nth(PUBLIC).dispatchEvent('contextmenu');
    await expect(page.locator('context-menu li').filter({ hasText: '公開範囲' })).toBeVisible({ timeout: 5000 });
    await dismissMenu(page);

    await setRole(page, 'PL');
    await page.locator('game-character').nth(PUBLIC).dispatchEvent('contextmenu');
    await expect(page.locator('context-menu li').filter({ hasText: '詳細を表示' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('context-menu li').filter({ hasText: '公開範囲' })).toHaveCount(0);
  });
});
