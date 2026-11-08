import { expect, Locator, Page } from '@playwright/test';

import { MENU_GROUP_OF, waitAppReady } from '../helpers';

/** What the graphics card refused to draw on each page made ready for shots, as the page logged it. */
const refused = new WeakMap<Page, string[]>();

/**
 * Whether a message the page logged says the graphics card refused something it was asked to draw:
 * a shader asking for more than the card lets it have, as more pictures than one stage of it may
 * read, leaves out everything drawn with that shader, and the shot is taken without it.
 */
function isRefusal(text: string): boolean {
  return /GPUValidationError|pipeline creation failed|Shader Error|exceeds the maximum/i.test(text);
}

export async function prepare(page: Page) {
  const refusals: string[] = [];
  refused.set(page, refusals);
  page.on('console', (message) => {
    if (message.type() === 'error' && isRefusal(message.text())) refusals.push(message.text());
  });
  await page.addInitScript(() => {
    let seed = 0x2f6e2b1;
    Object.assign(window, {
      reseedRandom: (next: number) => {
        seed = next;
      },
    });
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed ^ (seed >>> 15);
      t = Math.imul(t, 1 | t);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    crypto.randomUUID = () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.floor(Math.random() * 16);
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }) as `${string}-${string}-${string}-${string}-${string}`;
    localStorage.setItem('ui-theme', 'light');
    localStorage.setItem('ui-motion', 'on');
    localStorage.setItem('ui-widgets', JSON.stringify({}));
    localStorage.removeItem('ui-widget-layout');
  });
  await waitAppReady(page);
  await drawWhileClockHeld(page);
  await expect(page.locator('#app-loading')).toHaveCount(0, { timeout: 30_000 });
  await page.addStyleTag({ content: NO_RESTORE_OFFER });
  await page.addStyleTag({ content: NO_TRANSITIONS });
}

/**
 * Has the canvas build what drawing a new kind of thing asks of the graphics card on the frame that
 * draws it, as it did before it learnt to ready the card first: readying yields to the frames of a
 * clock the shots hold, and a scene drawn meanwhile leaves out what is still being readied. What is
 * being readied as the page opens is waited for here, while the clock still runs.
 */
async function drawWhileClockHeld(page: Page) {
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as CanvasHooks).__axeTable), { timeout: 30_000 })
    .toBe(true);
  await page.evaluate(() => (window as unknown as CanvasHooks).__axeTable?.readyBeforeDrawing(false));
  await drawCanvasThrough(page);
}

/**
 * Keeps the offer to restore a table kept in this browser off the shots. The page keeps the table
 * in the browser a little while after it changes, and the offer comes up once it has, at a moment
 * set by how fast the run goes.
 */
const NO_RESTORE_OFFER = 'app-room-restore-banner { display: none !important; }';

/**
 * Has every change of style take effect at once on a table drawn on a canvas. The canvas draws a
 * piece the page lays out from a picture of it taken as the page lays it out, and a transition runs
 * on real time, so a picture taken partway through one would catch it at a different stage each run.
 */
const NO_TRANSITIONS =
  '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; }';

/**
 * Starts the page's randomness over from a seed. Every change to a synced object draws on it, so
 * the numbers a scene comes to otherwise shift with whatever else the page did beforehand.
 */
export async function reseedRandom(page: Page, seed = 0x2f6e2b1) {
  await page.evaluate((next) => {
    (window as unknown as { reseedRandom(seed: number): void }).reseedRandom(next);
  }, seed);
}

/**
 * Waits for the chat box to be the editor. The plain box is drawn first and put away once the
 * editor has been fetched, and a line filled in as the two change places is lost.
 */
export async function waitChatEditor(page: Page) {
  await expect(page.locator('chat-window [data-chat-input-mode="rich"]')).toBeVisible({ timeout: 10000 });
}

export async function becomeGm(page: Page) {
  const connection = page.locator('ui-panel').filter({ hasText: '接続情報' });
  await connection.getByRole('button', { name: /^\s*GM\s*$/ }).click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

export async function closePanels(page: Page) {
  const panels = page.locator('ui-panel');
  for (let round = 0; round < 8 && (await panels.count()) > 0; round++) {
    await panels.first().locator('.bg-ui-titlebar button', { hasText: 'close' }).dispatchEvent('click');
  }
  await expect(panels).toHaveCount(0);
}

const frozen = new WeakSet<Page>();

const CLOCK_ORIGIN = new Date('2026-09-03T00:00:00Z');
const FROZEN_AT_MS = 2000;

/**
 * Stops the page's clock at a moment of its own. A table drawn on a canvas then draws what moves by
 * itself only as a shot is taken, at the moment the clock stands at, rather than the whole scene
 * again for every frame the clock is run through.
 */
export async function freeze(page: Page) {
  await page.clock.install({ time: CLOCK_ORIGIN });
  await page.clock.pauseAt(CLOCK_ORIGIN.getTime() + 1000);
  const drift = await page.evaluate(() => performance.now());
  await page.clock.runFor(Math.max(0, Math.round(FROZEN_AT_MS - drift)));
  await page.evaluate(() => (window as unknown as CanvasHooks).__axeTable?.holdMotion(true));
  frozen.add(page);
}

export async function settle(page: Page, ms = 40) {
  await page.clock.runFor(ms);
}

/**
 * Waits for every piece on the table to come to rest from what it does by itself, as a character
 * hops in when it is made: with the clock held, by running it on a little at a time.
 */
export async function untilStill(page: Page) {
  await expect
    .poll(
      async () => {
        const moving = await page.evaluate(() => {
          const hooks = (window as unknown as CanvasHooks).__axeTable;
          return [...document.querySelectorAll('[data-object-id]')].some((element) =>
            hooks?.moving(element.getAttribute('data-object-id') ?? '')
          );
        });
        if (moving && frozen.has(page)) await page.clock.runFor(50);
        return moving;
      },
      { timeout: 10_000, intervals: [50] }
    )
    .toBe(false);
}

/**
 * Waits for a part of the page loaded on demand, such as a panel, to come in and be drawn, which
 * shows as `arrived` being on the page. The clock is held and the page draws only as it is run, so
 * a part that comes in late on a busy machine is drawn by running what has fallen due, again and
 * again, without moving the clock on: the scene is shot at the same moment however long it took.
 */
export async function settleLazy(page: Page, arrived: Locator) {
  await page.waitForTimeout(400);
  await page.clock.runFor(40);
  await expect
    .poll(
      async () => {
        if ((await arrived.count()) > 0) return true;
        await page.clock.runFor(0);
        return false;
      },
      { timeout: 20_000, intervals: [100] }
    )
    .toBe(true);
}

export async function rightClickTable(page: Page, position: { x: number; y: number }): Promise<Locator> {
  await page.locator('#app-table-layer').click({ button: 'right', position });
  await settle(page);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  return menu;
}

/**
 * An entry of an open context menu, brought into view with the clock held: where it stands on the
 * menu's first level, or in the group it is gathered in, opened on the way.
 */
export async function menuEntry(page: Page, menu: Locator, text: string): Promise<Locator> {
  const entry = menu.getByText(text, { exact: true }).first();
  const group = MENU_GROUP_OF[text];
  if (group && !(await entry.isVisible())) {
    await menu.getByText(group, { exact: true }).first().hover();
    await settle(page, 400);
  }
  return entry;
}

/**
 * Rests the pointer on an entry of an open context menu. An entry is pointed at without Playwright
 * waiting for it to stand still over two frames of the page: with the clock held nothing on the menu
 * moves, and pages drawing through WebGPU in software beside one another may draw no frame for half
 * a minute, which left an entry that stood still waiting for one.
 */
export async function hoverMenu(page: Page, menu: Locator, text: string) {
  await (await menuEntry(page, menu, text)).hover({ force: true });
  await settle(page, 400);
}

/** Chooses an entry of an open context menu, pressed as {@link hoverMenu} points at one. */
export async function chooseMenu(page: Page, menu: Locator, text: string) {
  await (await menuEntry(page, menu, text)).click({ force: true });
  await settle(page);
}

export async function closeModal(page: Page) {
  await page.locator('modal button', { hasText: 'close' }).first().dispatchEvent('click');
  await settle(page);
  await expect(page.locator('modal')).toHaveCount(0);
}

/**
 * Where a right click lands on the bare board, clear of the sample room's pieces and the marks over
 * them, on the right of the board.
 */
export const BARE_BOARD_AT = { x: 1120, y: 380 };

export async function openTableSetting(page: Page) {
  const menu = await rightClickTable(page, BARE_BOARD_AT);
  await chooseMenu(page, menu, 'テーブル設定');
  await settleLazy(page, page.locator('modal select[name="tableGridType"]'));
  await expect(page.locator('modal select[name="tableGridType"]')).toBeVisible();
}

/** Turns the table to flat-topped hexes from the table settings. */
export async function useHexGrid(page: Page) {
  await openTableSetting(page);
  await page.locator('modal select[name="tableGridType"]').selectOption('1');
  await settle(page);
  await closeModal(page);
}

export async function holdAnimationsAt(page: Page, ms: number) {
  await page.evaluate((at) => {
    for (const animation of document.getAnimations()) {
      const endTime = animation.effect?.getComputedTiming().endTime;
      if (typeof endTime === 'number' && Number.isFinite(endTime)) {
        animation.finish();
        continue;
      }
      animation.pause();
      animation.currentTime = at;
    }
  }, ms);
}

type CanvasHooks = {
  __axeTable?: {
    drawDueNow(): boolean;
    busy(): string[];
    holdFlicker(timeMs: number | null): void;
    holdMotion(held: boolean): void;
    readyBeforeDrawing(on: boolean): void;
    holdMovesAt(ms: number | null): void;
    chooseLightsAfresh(): void;
    moving(identifier: string): boolean;
  };
};

/**
 * Has the table drawn on a canvas draw through what it was told, with the marks over its pieces laid
 * where it draws them: before a shot, or before where a piece stands on the page is read. The
 * pictures the page takes of pieces for it, and what it loads, arrive on real time, while each frame
 * they need comes only as a held clock moves on: so what has fallen due is run, and the frame waited
 * for is drawn at once, again and again, without moving the clock on.
 */
export async function drawCanvasThrough(page: Page) {
  await expect
    .poll(
      async () => {
        if (frozen.has(page)) await page.clock.runFor(0);
        return page.evaluate(() => {
          const table = (window as unknown as CanvasHooks).__axeTable;
          if (!table || table.drawDueNow()) return [];
          const busy = table.busy();
          return busy.length > 0 ? busy : ['nothing it names'];
        });
      },
      { message: 'what the canvas still waits for before it shows all it was told', timeout: 30_000, intervals: [50] }
    )
    .toEqual([]);
}

/**
 * Holds the flickering lights of a table drawn on a canvas as they are at a moment, for a scene
 * whose clock stands at a different moment each run by the time it is shot.
 */
export async function holdFlicker(page: Page, timeMs: number) {
  await page.evaluate((at) => (window as unknown as CanvasHooks).__axeTable?.holdFlicker(at), timeMs);
}

/** How long a shot may take: a table drawn on a canvas in software takes seconds to bring to the screen. */
const SHOT_TIMEOUT_MS = 30_000;

/**
 * How long a frame that turns a thing stays out once the pointer has left the thing, with a little
 * over: a clock held for the shots never lets it pass, so a frame brought out by the pointer last
 * resting over a thing would be shot with the thing.
 */
const TURN_FRAME_STAYS_MS = 700;

/**
 * Holds the pieces playing a move on a canvas as far into it as the page's own animations are held
 * for a shot: a move starts whenever what it plays for arrives, which a held clock does not hold.
 */
async function holdMovesAt(page: Page, ms: number) {
  await page.evaluate((at) => (window as unknown as CanvasHooks).__axeTable?.holdMovesAt(at), ms);
}

export interface SnapOptions {
  animationAt?: number;
  /** How long a picture may take to settle; a large 3D board rasterised in software takes seconds per shot. */
  timeout?: number;
}

export async function snap(page: Page, name: string, options: SnapOptions = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(1279, 799);
  if (frozen.has(page) && (await page.locator('[data-testid="turn-frame"]').count()) > 0) {
    await page.clock.runFor(TURN_FRAME_STAYS_MS);
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => (window as unknown as CanvasHooks).__axeTable?.chooseLightsAfresh());
  await holdAnimationsAt(page, options.animationAt ?? 0);
  await page.waitForTimeout(100);
  if (frozen.has(page)) await page.clock.runFor(16);
  await holdAnimationsAt(page, options.animationAt ?? 0);
  if (options.animationAt !== undefined) await holdMovesAt(page, options.animationAt);
  await drawCanvasThrough(page);
  expect(refused.get(page) ?? [], 'what the graphics card refused to draw').toEqual([]);
  const { animationAt: _at, ...compare } = options;
  await expect(page).toHaveScreenshot(`${name}.png`, { timeout: SHOT_TIMEOUT_MS, ...compare });
}
