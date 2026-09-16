import { expect, Locator, Page } from '@playwright/test';

import { waitAppReady } from '../helpers';

export async function prepare(page: Page) {
  await page.addInitScript(() => {
    let seed = 0x2f6e2b1;
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

export async function freeze(page: Page) {
  await page.clock.install({ time: CLOCK_ORIGIN });
  await page.clock.pauseAt(CLOCK_ORIGIN.getTime() + 1000);
  const drift = await page.evaluate(() => performance.now());
  await page.clock.runFor(Math.max(0, Math.round(FROZEN_AT_MS - drift)));
  frozen.add(page);
}

export async function settle(page: Page, ms = 40) {
  await page.clock.runFor(ms);
}

export async function settleLazy(page: Page) {
  await page.waitForTimeout(400);
  await page.clock.runFor(40);
}

export async function rightClickTable(page: Page, position: { x: number; y: number }): Promise<Locator> {
  await page.locator('#app-table-layer').click({ button: 'right', position });
  await settle(page);
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  return menu;
}

export async function hoverMenu(page: Page, menu: Locator, text: string) {
  await menu.getByText(text, { exact: true }).hover();
  await settle(page, 400);
}

export async function chooseMenu(page: Page, menu: Locator, text: string) {
  await menu.getByText(text, { exact: true }).click();
  await settle(page);
}

export async function closeModal(page: Page) {
  await page.locator('modal button', { hasText: 'close' }).first().dispatchEvent('click');
  await settle(page);
  await expect(page.locator('modal')).toHaveCount(0);
}

export async function openTableSetting(page: Page) {
  const menu = await rightClickTable(page, { x: 900, y: 250 });
  await chooseMenu(page, menu, 'テーブル設定');
  await settleLazy(page);
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

export interface SnapOptions {
  maxDiffPixels?: number;
  maxDiffPixelRatio?: number;
  threshold?: number;
  animationAt?: number;
  /** How long a picture may take to settle; a large 3D board rasterised in software takes seconds per shot. */
  timeout?: number;
}

export async function snap(page: Page, name: string, options: SnapOptions = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(1279, 799);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await holdAnimationsAt(page, options.animationAt ?? 0);
  await page.waitForTimeout(100);
  if (frozen.has(page)) await page.clock.runFor(16);
  await holdAnimationsAt(page, options.animationAt ?? 0);
  const { animationAt: _at, ...compare } = options;
  await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixels: 4, ...compare });
}
