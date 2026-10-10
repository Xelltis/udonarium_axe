import { expect, Locator, Page } from '@playwright/test';

/**
 * 起動完了を待つ。ChatWindowComponent / PeerMenuComponentが自動起動するので、
 * chat-inputのtextareaが表示されればbootstrap完了とみなしてよい。
 */
export async function waitAppReady(page: Page) {
  // A load off the build takes well under a second, but with three browsers running the suite at
  // once a load was seen to take past the default fifteen seconds in Firefox.
  await page.goto('/', { timeout: 45_000 });
  await expect(page.locator('textarea.chat-input')).toBeVisible({ timeout: 20000 });
}

/**
 * 左上FABのハンバーガーメニューを開く。閉じている時のみクリックする。
 * data-labelアイテムは`pointer-events-none`なので、開かないと選択不可。
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
 * 左上FABのメニューを閉じる。開いている時のみクリックする。
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
 * FABを開き、最下段の「表示」からこの端末の表示設定の小窓を開く。開いた小窓を返す。
 */
export function openSeatDisplay(page: Page): Promise<Locator> {
  return openFabSubmenu(page, 'fab-display', 'seat-display');
}

/**
 * FABを開き、最下段の「ウィジェット」からウィジェットの小窓を開く。開いた小窓を返す。
 */
export function openSeatWidgets(page: Page): Promise<Locator> {
  return openFabSubmenu(page, 'fab-widgets', 'seat-widgets');
}

/**
 * FABを開き、最下段の「セーブ&ロード」から保存と読込の小窓を開く。開いた小窓を返す。
 */
export function openSaveLoad(page: Page): Promise<Locator> {
  return openFabSubmenu(page, 'fab-save-load', 'save-load');
}

async function openFabSubmenu(page: Page, openerTestId: string, menuTestId: string): Promise<Locator> {
  await openFabMenu(page);
  const panel = page.locator(`[data-testid="${menuTestId}"]`);
  if (!(await panel.isVisible())) await page.locator(`[data-testid="${openerTestId}"]`).click();
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * FABを開いた上でdata-labelのメニュー項目をクリックする。
 * 既存テストで`getByText('インベントリ')`などを呼んでいた箇所の置換用。
 */
export async function openPanel(page: Page, dataLabel: string) {
  await openFabMenu(page);
  const submenu = Object.entries(SUBMENU_LABELS).find(([, labels]) => labels.includes(dataLabel))?.[0];
  if (submenu) await openFabSubmenu(page, `fab-entry-${submenu}`, `fab-submenu-${submenu}`);
  await page.locator(`[data-label="${dataLabel}"]`).click();
}

/** FABの項目が開く小窓と、その中にある項目。小窓の中の項目は、押す前に小窓を開く。 */
const SUBMENU_LABELS: Readonly<Record<string, readonly string[]>> = {
  table: ['テーブル設定', 'マップエディター', 'マップ生成', '卓上ディスプレイ', 'ノベルモード'],
  gameResources: ['インベントリ', 'バフマネージャー', '状態異常', 'ダイス表設定', '手札'],
  media: ['画像', 'ジュークボックス', 'カットイン', 'エフェクト'],
};

/**
 * チャットウィンドウ右上の歯車（details/summary）を開いて、
 * 「タブ設定」「ダイス表設定」「チャット設定」のいずれかのボタンをクリックする。
 * detailsがclosedのままだと中のボタンはhit-test不可なため、必ず先にopenする。
 */
export async function openChatSettingsMenuItem(page: Page, itemName: 'タブ設定' | 'ダイス表設定' | 'チャット設定') {
  const summary = page.locator('chat-window summary[title="チャット設定"]');
  await summary.click();
  await page.locator('chat-window details[open] button', { hasText: itemName }).click();
}

/**
 * chat-window内のタブピル（ラジオボタンに紐づくラベル）をnameで取得する。
 * パネルタイトル「チャットウィンドウ - メインタブ」と混在するので、exact指定にする。
 */
export function chatTabPill(page: Page, name: string): Locator {
  return page.locator('chat-window .chat-tab-pill', { hasText: new RegExp(`^\\s*${name}\\s*`) });
}

/**
 * テーブル上で右クリックしてcontext-menuを表示する。
 *
 * 起動時にPeerMenu（left=80, width=460）とChatWindow（left=80, width=660）が
 * 自動展開されており、ビューポート左～中央へのクリックはui-panelのリサイズハンドラに
 * 取られてしまう。安全圏として右側（x≈1100, y≈250）を既定にする。
 * PointerDeviceServiceがcontextmenu許可フラグを上げるにはmousedown経由の
 * クリックが必要なので、eventのdispatchEventではなく実際の`.click()`を使う。
 */
export async function openTableContextMenu(page: Page, position = { x: 900, y: 250 }) {
  const table = page.locator('#app-table-layer');
  await table.click({ button: 'right', position });
  // context-menuはContextMenuService.open()でcreateComponentされ、close()で
  // destroyされる。要素自体がDOMにある間はitemsが常にレンダリングされるため、
  // 中の<li>の出現を待てば「メニューの描画が完了した」ことを確実に判定できる。
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
 * テーブル上に新規ダイスシンボル（D6）を作成する。
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
 * ng-selectは候補パネルをbody直下のCDKオーバーレイに出すので、
 * visual-novel-overlayスコープのロケータでは届かない。
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

/** ノベルモードの発言入力欄。ng-selectもinputを持つので、data-testidで拾う。 */
export function vnMessageInput(page: Page): Locator {
  return page.locator('visual-novel-overlay [data-testid="vn-message"]');
}
