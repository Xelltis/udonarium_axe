import { expect, Locator, Page } from '@playwright/test';

/**
 * Waits for start-up to finish. ChatWindowComponent and PeerMenuComponent open on their own, so the
 * bootstrap can be taken as done once the textarea of chat-input shows.
 */
/**
 * Turns off blurring what lies behind an element, where the page is drawn by WebKit.
 *
 * The WebKit that Playwright 1.64 brings (27.2 on Linux) stops drawing frames while some small
 * elements blur what lies behind them, such as the hotbar's page buttons and the novel mode's
 * controls: animations never finish, and an action waits on an element that never settles. The
 * look is checked in Chromium by the visual project; what the WebKit runs check takes no part in
 * the blur. Call it before the page is opened.
 */
export async function avoidWebKitBackdropStall(page: Page): Promise<void> {
  if (page.context().browser()?.browserType().name() !== 'webkit') return;
  await page.addInitScript(() => {
    const unblur = () => {
      const style = document.createElement('style');
      style.textContent =
        '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
      (document.head ?? document.documentElement).appendChild(style);
    };
    if (document.documentElement) unblur();
    else document.addEventListener('DOMContentLoaded', unblur, { once: true });
  });
}

export async function waitAppReady(page: Page) {
  await avoidWebKitBackdropStall(page);
  // A load off the build takes well under a second, but with three browsers running the suite at
  // once a load was seen to take past the default fifteen seconds in Firefox.
  await page.goto('/', { timeout: 45_000 });
  await expect(page.locator('textarea.chat-input')).toBeVisible({ timeout: 20000 });
}

/**
 * Opens the hamburger menu of the top-left FAB, clicking only while it is closed. The data-label
 * items are `pointer-events-none`, so they cannot be chosen until it opens.
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
 * Closes the menu of the top-left FAB, clicking only while it is open. Left open, it keeps the
 * pointer from reaching the panels on the left of the screen.
 */
export async function closeFabMenu(page: Page) {
  const fabBtn = page.getByRole('button', { name: /メニューを(開く|閉じる)/ });
  if ((await fabBtn.getAttribute('aria-expanded')) === 'true') {
    await fabBtn.click();
    await expect(fabBtn).toHaveAttribute('aria-expanded', 'false');
  }
}

/**
 * Opens the FAB and, from Display at the bottom, the small window of this device's display
 * settings. Returns the window opened.
 */
export function openSeatDisplay(page: Page): Promise<Locator> {
  return openFabSubmenu(page, 'fab-display', 'seat-display');
}

/** Opens the FAB and, from Widgets at the bottom, the small window of widgets. Returns the window opened. */
export function openSeatWidgets(page: Page): Promise<Locator> {
  return openFabSubmenu(page, 'fab-widgets', 'seat-widgets');
}

/**
 * Opens the FAB and, from Save & load at the bottom, the small window for saving and loading.
 * Returns the window opened.
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
 * Opens the FAB and clicks the menu entry with that data-label. It replaces the places where
 * earlier tests called `getByText('インベントリ')` and the like.
 */
export async function openPanel(page: Page, dataLabel: string) {
  await openFabMenu(page);
  const submenu = Object.entries(SUBMENU_LABELS).find(([, labels]) => labels.includes(dataLabel))?.[0];
  if (submenu) await openFabSubmenu(page, `fab-entry-${submenu}`, `fab-submenu-${submenu}`);
  await page.locator(`[data-label="${dataLabel}"]`).click();
}

/**
 * The small windows the FAB entries open, and the entries in each. An entry inside a small window
 * has the window opened before it is pressed.
 */
const SUBMENU_LABELS: Readonly<Record<string, readonly string[]>> = {
  table: ['テーブル設定', 'マップエディター', 'マップ生成', '卓上ディスプレイ', 'ノベルモード'],
  gameResources: ['インベントリ', 'バフマネージャー', '状態異常', 'ダイス表設定', '手札'],
  media: ['画像', 'ジュークボックス', 'カットイン', 'エフェクト'],
};

/**
 * Opens the gear (details/summary) at the top right of the chat window and clicks one of the tab
 * settings, dice table settings and chat settings buttons. The buttons inside cannot be hit-tested
 * while the details is closed, so it is always opened first.
 */
export async function openChatSettingsMenuItem(page: Page, itemName: 'タブ設定' | 'ダイス表設定' | 'チャット設定') {
  const summary = page.locator('chat-window summary[title="チャット設定"]');
  await summary.click();
  await page.locator('chat-window details[open] button', { hasText: itemName }).click();
}

/**
 * Gets a tab pill in chat-window (the label tied to a radio button) by its name. The panel title,
 * which reads the chat window followed by the main tab, holds the same words, so the match is exact.
 */
export function chatTabPill(page: Page, name: string): Locator {
  return page.locator('chat-window .chat-tab-pill', { hasText: new RegExp(`^\\s*${name}\\s*`) });
}

/**
 * Right-clicks the table to bring up context-menu.
 *
 * At start-up PeerMenu (left=80, width=460) and ChatWindow (left=80, width=660) open on their own,
 * and a click from the left to the middle of the viewport is taken by the resize handler of a
 * ui-panel. The right side (x≈1100, y≈250) is the default as a safe area. PointerDeviceService
 * raises its flag allowing contextmenu only on a click that goes through mousedown, so a real
 * `.click()` is used rather than dispatchEvent.
 */
export async function openTableContextMenu(page: Page, position = { x: 900, y: 250 }) {
  const table = page.locator('#app-table-layer');
  await table.click({ button: 'right', position });
  // context-menu is made with createComponent by ContextMenuService.open() and destroyed by
  // close(). While the element is in the DOM its items are always rendered, so waiting for an <li>
  // inside to appear tells for sure that the menu has been drawn.
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  return menu;
}

/** Makes a new character on the table. */
export async function createCharacter(page: Page) {
  const menu = await openTableContextMenu(page);
  await menu.getByText('キャラクターを作成').click();
  await expect(page.locator('game-character').first()).toBeAttached({ timeout: 10000 });
}

/** Makes a new dice symbol (D6) on the table. */
export async function createDiceSymbol(page: Page) {
  const menu = await openTableContextMenu(page);
  await (await revealMenuEntry(page, menu, 'ダイスを作成')).hover();
  await expect(menu.getByText('D6')).toBeVisible({ timeout: 5000 });
  await menu.getByText('D6').click();
  await expect(page.locator('dice-symbol').first()).toBeAttached({ timeout: 10000 });
}

/**
 * Chooses the speaking character of novel mode. ng-select puts its panel of choices in a CDK
 * overlay right under body, which a locator scoped to visual-novel-overlay cannot reach.
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

/** The line input of novel mode. ng-select has an input too, so it is picked up by its data-testid. */
export function vnMessageInput(page: Page): Locator {
  return page.locator('visual-novel-overlay [data-testid="vn-message"]');
}

/**
 * The group of a context menu each entry kept out of the menu's first level is gathered in, by the
 * entry's name: the table's create menu, and a character's.
 */
export const MENU_GROUP_OF: Readonly<Record<string, string>> = {
  バフ編集: 'バフ・演出',
  バフの表示: 'バフ・演出',
  登録済み射程を出す: 'バフ・演出',
  演出を発動: 'バフ・演出',
  ダイスを展開する: 'バフ・演出',
  '視界・光源設定…': '視界と視点',
  視界範囲を表示: '視界と視点',
  このコマの視点で見る: '視界と視点',
  全員をこのコマの視点にする: '視界と視点',
  全員の共有視点を解除する: '視界と視点',
  名前を隠す: '表示と扱い',
  バフを隠す: '表示と扱い',
  'NPC にする': '表示と扱い',
  インベントリ非表示: '表示と扱い',
  手番をもたない: '表示と扱い',
  発言しない: '表示と扱い',
  高度設定: '表示と扱い',
  公開範囲: '公開とオーナー',
  オーナー: '公開とオーナー',
  共有イベントリに移動: 'しまう',
  個人イベントリに移動: 'しまう',
  墓場に移動: 'しまう',
  姿が見えない: 'コマの状態',
  倒れている: 'コマの状態',
  転んでいる: 'コマの状態',
  その場から動けない: 'コマの状態',
  乗り物にする: '乗り物',
  同乗できる: '乗り物',
  積める数: '乗り物',
  技能がなくても乗れる: '乗り物',
  乗る高さ: '乗り物',
};

/**
 * An entry of an open context menu, brought into view: where it stands on the menu's first level,
 * or in the group it is gathered in, which is opened on the way.
 */
export async function revealMenuEntry(page: Page, menu: Locator, name: string, exact = false): Promise<Locator> {
  const entry = menu.getByText(name, { exact }).first();
  if (await entry.isVisible()) return entry;
  const group = Object.entries(MENU_GROUP_OF).find(([key]) => key === name || (!exact && key.includes(name)))?.[1];
  if (group) await menu.getByText(group, { exact: true }).first().hover();
  await expect(entry).toBeVisible({ timeout: 5000 });
  return entry;
}
