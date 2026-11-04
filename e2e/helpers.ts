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

/**
 * The box chat lines are typed into: a plain one, or the editor that draws a line as it will look.
 * `fill`, `press` and focus work on either; read what it holds with {@link chatInputText}.
 */
export function chatInput(scope: Page | Locator): Locator {
  return scope.locator('[data-chat-input]');
}

/** What the chat input holds, read the same way whether it is a plain box or the editor. */
export function chatInputText(input: Locator): Promise<string> {
  return input.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) return element.value;
    const read = (element as HTMLElement & { chatText?: () => string }).chatText;
    return read ? read() : (element.textContent ?? '');
  });
}

/** Waits for the chat input to hold the text. */
export async function expectChatText(input: Locator, text: string): Promise<void> {
  await expect.poll(() => chatInputText(input)).toBe(text);
}

/**
 * Has the sample room's pieces drawn as the models the app bundles for them, which the suite's
 * server holds back from the projects that draw the table on a canvas (see e2e/serve-dist.mjs).
 * Call before the page is opened.
 */
export async function drawSampleModels(page: Page) {
  await page.context().clearCookies({ name: 'axe-e2e-sample-models' });
}

/**
 * A point of the page where the page draws a piece itself, for a press to take hold of it by or the
 * pointer to rest on it at: the middle of the base it stands on, or where that is hidden, as by a
 * piece in front of it or a standing board, a point of its picture. On a canvas the table's line of
 * sight picks what a press takes, and a point it picks the piece at is taken only where no panel lies
 * over the table, and once the pointer resting there reaches the piece too, rather than another
 * piece's mark or a card over it. Leaves the pointer on the point.
 */
export async function spotOnPiece(of: Locator): Promise<{ x: number; y: number }> {
  const candidates = await of.evaluate((element) => {
    const table = (
      window as { __axeTable?: { renderer(): string | null; pickAt(x: number, y: number): string | null } }
    ).__axeTable;
    const id = element.getAttribute('data-object-id');
    const takesIt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      if (!table?.renderer()) return hit?.closest('game-character') === element;
      return !!hit?.closest('#app-table-layer') && table.pickAt(x, y) === id;
    };
    const found: { x: number; y: number }[] = [];
    const base = element.querySelector('[data-testid="multi-angle-piece-motion-source"]')!.getBoundingClientRect();
    const middle = { x: base.left + base.width / 2, y: base.top + base.height / 2 };
    if (takesIt(middle.x, middle.y)) found.push(middle);
    const picture = element.querySelector('[data-part="picture"]')!.getBoundingClientRect();
    for (let y = picture.top + picture.height / 2; y < picture.bottom && found.length < 12; y += 6) {
      for (let x = picture.left + 2; x < picture.right && found.length < 12; x += 6) {
        if (takesIt(x, y)) found.push({ x, y });
      }
    }
    return found;
  });
  for (const spot of candidates) {
    await of.page().mouse.move(spot.x, spot.y);
    const reached = await of.evaluate(
      (element, [x, y]) => document.elementFromPoint(x, y)?.closest('game-character') === element,
      [spot.x, spot.y]
    );
    if (reached) return spot;
  }
  expect(null, 'a point the piece takes a press at').not.toBeNull();
  return candidates[0];
}

export async function waitAppReady(page: Page) {
  await avoidWebKitBackdropStall(page);
  // A load off the build takes well under a second, but with three browsers running the suite at
  // once a load was seen to take past the default fifteen seconds in Firefox.
  await page.goto('/', { timeout: 45_000 });
  await expect(chatInput(page)).toBeVisible({ timeout: 20000 });
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
  table: ['テーブル設定', 'シーン', 'マップエディター', 'マップ生成', '卓上ディスプレイ', 'ノベルモード'],
  gameResources: ['インベントリ', 'バフマネージャー', '状態異常', 'ダイス表設定', '手札'],
  media: ['画像', 'ジュークボックス', 'カットイン', 'エフェクト', '戦闘カットイン', 'シナリオテキスト'],
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
 * Where a right click on the table lands on the bare board, clear of the sample room's pieces and
 * the marks over them, on the right of the board, clear of the panels too.
 */
export const TABLE_MENU_AT = { x: 1120, y: 340 };

/**
 * A point of the sample room's board, as the page first shows it, on the open ground at its lower
 * right: far enough from every piece that pieces brought here meet, move and ride with none of the
 * others in reach, and with room on every side for a move of a few cells.
 */
export const OPEN_GROUND_AT = { x: 920, y: 540 };

/**
 * Right-clicks the table to bring up context-menu.
 *
 * At start-up PeerMenu (left=80, width=460) and ChatWindow (left=80, width=660) open on their own,
 * and a click from the left to the middle of the viewport is taken by the resize handler of a
 * ui-panel. The right side (`TABLE_MENU_AT`) is the default as a safe area. PointerDeviceService
 * raises its flag allowing contextmenu only on a click that goes through mousedown, so a real
 * `.click()` is used rather than dispatchEvent.
 */
export async function openTableContextMenu(page: Page, position = TABLE_MENU_AT) {
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
  const before = await page.locator('game-character').count();
  const menu = await openTableContextMenu(page);
  await menu.getByText('キャラクターを作成').click();
  await expect(page.locator('game-character')).toHaveCount(before + 1, { timeout: 10000 });
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
  戦闘カットイン: 'バフ・演出',
  ダイスを展開する: 'バフ・演出',
  '視界・光源設定…': '視界と視点',
  視界範囲を表示: '視界と視点',
  このコマの視点で見る: '視界と視点',
  全員をこのコマの視点にする: '視界と視点',
  全員の共有視点を解除する: '視界と視点',
  このコマを後ろから追う: '視界と視点',
  後ろから追うのをやめる: '視界と視点',
  名前を隠す: '表示と扱い',
  バフを隠す: '表示と扱い',
  'NPC にする': '表示と扱い',
  インベントリ非表示: '表示と扱い',
  手番をもたない: '表示と扱い',
  発言しない: '表示と扱い',
  高度設定: '表示と扱い',
  リソースのスライダー: '表示と扱い',
  公開範囲: '公開とオーナー',
  オーナー: '公開とオーナー',
  共有イベントリに移動: 'しまう',
  個人イベントリに移動: 'しまう',
  墓場に移動: 'しまう',
  姿が見えない: 'コマの状態',
  倒れている: 'コマの状態',
  転んでいる: 'コマの状態',
  その場から動けない: 'コマの状態',
  'ステルス（GMと持ち主・仲間にだけ見える）': 'コマの状態',
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

/** Turns a piece by dragging the handle given round its middle, as far as the drag takes it. */
export async function turnByHandle(page: Page, handle: Locator) {
  await handle.hover({ force: true });
  const box = (await handle.boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 70, { steps: 8 });
  await page.mouse.move(from.x + 90, from.y + 110, { steps: 8 });
  await page.mouse.up();
}
