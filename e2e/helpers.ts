import { expect, Locator, Page } from '@playwright/test';

/**
 * 起動完了を待つ。 ChatWindowComponent / PeerMenuComponent が自動起動するので
 * chat-input の textarea が表示されれば bootstrap 完了とみなしてよい。
 */
export async function waitAppReady(page: Page) {
  await page.goto('/');
  await expect(page.locator('textarea.chat-input')).toBeVisible({ timeout: 20000 });
}

/**
 * 左上 FAB のハンバーガーメニューを開く。閉じている時のみクリックする。
 * data-label アイテムは `pointer-events-none` なので開かないと選択不可。
 */
export async function openFabMenu(page: Page) {
  const fabBtn = page.getByRole('button', { name: /メニューを(開く|閉じる)/ });
  const expanded = await fabBtn.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await fabBtn.click();
    await expect(fabBtn).toHaveAttribute('aria-expanded', 'true');
  }
}

/**
 * 左上 FAB のメニューを閉じる。開いている時のみクリックする。
 * 開いたままだと画面左側のパネルにポインタが届かない。
 */
export async function closeFabMenu(page: Page) {
  const fabBtn = page.getByRole('button', { name: /メニューを(開く|閉じる)/ });
  if ((await fabBtn.getAttribute('aria-expanded')) === 'true') {
    await fabBtn.click();
    await expect(fabBtn).toHaveAttribute('aria-expanded', 'false');
  }
}

/**
 * FAB を開いた上で data-label のメニュー項目をクリックする。
 * 既存テストで `getByText('インベントリ')` などを呼んでいた箇所の置換用。
 */
export async function openPanel(page: Page, dataLabel: string) {
  await openFabMenu(page);
  await page.locator(`[data-label="${dataLabel}"]`).click();
}

/**
 * チャットウィンドウ右上の歯車（details/summary）を開いて、
 * 「タブ設定」「ダイス表設定」「チャット設定」のいずれかのボタンをクリックする。
 * details が closed のままだと中のボタンは hit-test 不可なため、必ず先に open する。
 */
export async function openChatSettingsMenuItem(page: Page, itemName: 'タブ設定' | 'ダイス表設定' | 'チャット設定') {
  const summary = page.locator('chat-window summary[title="チャット設定"]');
  await summary.click();
  await page.locator('chat-window details[open] button', { hasText: itemName }).click();
}

/**
 * chat-window 内のタブピル (ラジオボタンに紐づくラベル) を name で取得する。
 * パネルタイトル「チャットウィンドウ - メインタブ」と混在するので exact 指定。
 */
export function chatTabPill(page: Page, name: string): Locator {
  return page.locator('chat-window .chat-tab-pill', { hasText: new RegExp(`^\\s*${name}\\s*`) });
}

/**
 * テーブル上で右クリックして context-menu を表示する。
 *
 * 起動時 PeerMenu (left=80, width=460) と ChatWindow (left=80, width=660) が
 * 自動展開されており、ビューポート左～中央は ui-panel のリサイズハンドラに
 * 食われる。安全圏として右側 (x≈1100, y≈250) を既定にする。
 * PointerDeviceService が contextmenu 許可フラグを上げるために mousedown 経由の
 * クリックが必要なので、event の dispatchEvent ではなく実際の `.click()` を使う。
 */
export async function openTableContextMenu(page: Page, position = { x: 900, y: 250 }) {
  const table = page.locator('#app-table-layer');
  await table.click({ button: 'right', position });
  // context-menu は ContextMenuService.open() で createComponent され、close() で
  // destroy される。要素自体が DOM に居る期間は items が常にレンダリングされるため
  // 中の <li> 出現を待つことで「メニューが描画完了した」を確実に判定できる。
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  return menu;
}

/**
 * テーブル上に新規キャラクターを作成する。
 */
export async function createCharacter(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('キャラクターを作成').click();
  await expect(page.locator('game-character').first()).toBeAttached({ timeout: 10000 });
}

/**
 * テーブル上に新規ダイスシンボル (D6) を作成する。
 */
export async function createDiceSymbol(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('ダイスを作成').hover();
  await expect(menu.getByText('D6')).toBeVisible({ timeout: 5000 });
  await menu.getByText('D6').click();
  await expect(page.locator('dice-symbol').first()).toBeAttached({ timeout: 10000 });
}

/**
 * ノベルモードの発言キャラクターを選ぶ。
 * ng-select は候補パネルを body 直下の CDK オーバーレイに出すので、
 * visual-novel-overlay スコープのロケータでは届かない。
 */
export async function openVnSpeakerList(page: Page): Promise<Locator> {
  await page.locator('visual-novel-overlay [data-testid="vn-speaker"]').click();
  const panel = page.locator('.ng-dropdown-panel');
  await expect(panel).toBeVisible({ timeout: 5000 });
  return panel;
}

export async function selectVnSpeaker(page: Page, name: string) {
  const panel = await openVnSpeakerList(page);
  await page.locator('visual-novel-overlay [data-testid="vn-speaker"] input').fill(name);
  await panel.getByRole('option', { name, exact: true }).click();
  await expect(panel).toBeHidden({ timeout: 5000 });
}

/** ノベルモードの発言入力欄。ng-select も input を持つので data-testid で拾う。 */
export function vnMessageInput(page: Page): Locator {
  return page.locator('visual-novel-overlay [data-testid="vn-message"]');
}
