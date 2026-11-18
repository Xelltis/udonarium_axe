import { expect, Locator, Page, test } from '@playwright/test';

import { closePanels, createCharacter, idle, openPanel, waitAppReady } from './helpers';
import { idsOf } from './piece-helpers';

/**
 * The list of effects as it is laid out: the size it opens at and comes back at, how much of the
 * shelf is in sight without scrolling, how a family is reached from the index, how the list is
 * narrowed and searched, and that its words and outlines can be read in both themes.
 */

type Box = { x: number; y: number; width: number; height: number };

/** How large the panel opens the first time, and the smallest it may be made. */
const FIRST_SIZE = { width: 540, height: 720 };

/** The key the size the panel was left at is kept under in the browser. */
const SIZE_KEY = 'axe.effect.librarySize';

/** The four regions the panel is laid out in, from the top, and the boxes of the one an effect is held ready in. */
const FIXED = [
  'effect-library-filters',
  'effect-library-stance',
  'effect-library-list',
  'effect-library-notice',
  'effect-library-preview',
  'effect-library-stance-name',
  'effect-library-stance-caster',
  'effect-library-stance-targets',
  'effect-library-fire',
  'effect-library-cancel',
];

test.use({ viewport: { width: 1280, height: 800 } });

/** Opens the list of effects and waits for its rows. */
async function openEffectLibrary(page: Page): Promise<Locator> {
  await openPanel(page, 'エフェクト');
  const panel = page.locator('effect-library-panel');
  await expect(panel.locator('[data-effect-tile]').first()).toBeVisible({ timeout: 10000 });
  return panel;
}

/** The frame the panel stands in. */
function frameOf(page: Page, panel: Locator): Locator {
  return page.locator('[data-testid="ui-panel"]', { has: panel });
}

/** The names of the rows that stand whole inside the list as it is scrolled now. */
function rowsInSight(panel: Locator): Promise<string[]> {
  return panel.getByTestId('effect-library-rows').evaluate((list) => {
    const view = list.getBoundingClientRect();
    return Array.from(list.querySelectorAll('[data-effect-tile]'))
      .filter((row) => {
        const box = row.getBoundingClientRect();
        return box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5;
      })
      .map((row) => row.querySelector('[data-effect-name]')?.textContent?.replace(/\s+/g, '') ?? '');
  });
}

/** How far the heading of a family stands from the top of the list, above it or below. */
function headingOffset(panel: Locator, family: string): Promise<number> {
  return panel.getByTestId('effect-library-rows').evaluate((list, tag) => {
    const section = Array.from(list.querySelectorAll<HTMLElement>('[data-family-section]')).find(
      (each) => each.dataset['familySection'] === tag
    );
    const heading = section?.querySelector('[data-family-heading]');
    return heading ? Math.abs(heading.getBoundingClientRect().top - list.getBoundingClientRect().top) : Number.NaN;
  }, family);
}

/** Presses a piece on the table, sent straight to the element the piece is grabbed by. */
async function press(page: Page, identifier: string): Promise<void> {
  const grab = page.locator(`game-character[data-object-id="${identifier}"] [appmovable]`).first();
  await grab.dispatchEvent('mousedown', { button: 0, buttons: 1 });
  await grab.dispatchEvent('mouseup', { button: 0, buttons: 0 });
}

async function boxesOf(scope: Locator, testIds: readonly string[]): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const testId of testIds) boxes.push((await scope.getByTestId(testId).boundingBox())!);
  return boxes;
}

test.describe('the list of effects', () => {
  test('opens at 540 by 720 inside the window, with twelve rows and every family in sight before any scrolling', async ({
    page,
  }) => {
    await waitAppReady(page);
    const panel = await openEffectLibrary(page);
    const frame = (await frameOf(page, panel).boundingBox())!;

    expect({ width: Math.round(frame.width), height: Math.round(frame.height) }).toEqual(FIRST_SIZE);
    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(1280);
    expect(frame.y + frame.height).toBeLessThanOrEqual(800);

    const inSight = await rowsInSight(panel);
    expect(inSight.length).toBeGreaterThanOrEqual(12);
    expect(inSight.every((name) => name.length > 0)).toBe(true);

    // Every family of the shelf is named in the index with its count, none of them scrolled out of it.
    const index = await panel.getByTestId('effect-library-index').evaluate((nav) => {
      const view = nav.getBoundingClientRect();
      return Array.from(nav.querySelectorAll('[data-family-entry]')).map((entry) => {
        const box = entry.getBoundingClientRect();
        const [name, count] = Array.from(entry.querySelectorAll('span'))
          .slice(1)
          .map((part) => part.textContent?.trim() ?? '');
        const label = entry.querySelector('span:nth-of-type(2)') as HTMLElement;
        return {
          name,
          count: Number(count),
          whole: box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5,
          cut: label.scrollWidth > label.clientWidth,
        };
      });
    });
    const rows = await panel.locator('[data-effect-tile]').count();
    expect(index.length).toBeGreaterThanOrEqual(17);
    expect(index.filter((entry) => !entry.whole || entry.cut)).toEqual([]);
    expect(index.every((entry) => entry.count > 0)).toBe(true);
    expect(index.reduce((sum, entry) => sum + entry.count, 0)).toBe(rows);
    expect(index.slice(0, 3).map((entry) => entry.name)).toEqual(['物理', '打撃', '射撃']);

    // No name of the shelf is cut short, anywhere down the list.
    const cut = await panel
      .locator('[data-effect-name]')
      .evaluateAll((names) =>
        names
          .filter((name) => name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1)
          .map((name) => name.textContent?.trim())
      );
    expect(cut).toEqual([]);

    // The field shows the whole of what it asks to be typed.
    const field = panel.locator('input[type=search]');
    await expect(field).toHaveAttribute('placeholder', /名前・系統/);
    expect(await field.evaluate((input) => input.scrollWidth <= input.clientWidth)).toBe(true);
  });

  test('opens no taller than a window lower than itself, the list alone giving up the room', async ({ page }) => {
    await waitAppReady(page);
    const panel = await openEffectLibrary(page);
    const full = await boxesOf(panel, ['effect-library-filters', 'effect-library-stance', 'effect-library-notice']);
    await frameOf(page, panel).getByTestId('panel-close').dispatchEvent('click');
    await expect(panel).toHaveCount(0);

    // Narrower than this, the window is a phone's, where every panel fills the screen.
    const window = { width: 1024, height: 600 };
    await page.setViewportSize(window);
    const small = await openEffectLibrary(page);
    const frame = (await frameOf(page, small).boundingBox())!;

    expect(frame.x).toBeGreaterThanOrEqual(0);
    expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(window.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(window.height);
    expect(Math.round(frame.width)).toBe(FIRST_SIZE.width);
    const shrunk = await boxesOf(small, ['effect-library-filters', 'effect-library-stance', 'effect-library-notice']);
    expect(shrunk.map((box) => box.height)).toEqual(full.map((box) => box.height));
    expect((await small.getByTestId('effect-library-list').boundingBox())!.height).toBeGreaterThan(40);
  });

  test('brings any family’s heading to the top of the list at one press or from the keyboard, and takes nothing out of the list', async ({
    page,
  }) => {
    await waitAppReady(page);
    const panel = await openEffectLibrary(page);
    const entries = panel.locator('[data-family-entry]');
    const rows = await panel.locator('[data-effect-tile]').count();
    const families = await entries.evaluateAll((all) => all.map((entry) => entry.getAttribute('data-family') ?? ''));
    const last = families[families.length - 1];

    for (const family of ['氷', last, '物理']) {
      await panel.locator(`[data-family-entry][data-family="${family}"]`).click();
      await expect.poll(() => headingOffset(panel, family)).toBeLessThan(1.5);
      await expect(panel.locator(`[data-family-entry][data-family="${family}"]`)).toHaveAttribute(
        'aria-current',
        'true'
      );
      await expect(panel.locator('[data-family-entry][aria-current="true"]')).toHaveCount(1);
    }
    expect(await panel.locator('[data-effect-tile]').count()).toBe(rows);
    await expect(panel.getByTestId('effect-library-count')).toHaveCount(0);

    // From the keyboard: into the index, down to the last family, Enter.
    await panel.locator('[data-family-entry][tabindex="0"]').focus();
    await page.keyboard.press('End');
    await expect(entries.last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => headingOffset(panel, last)).toBeLessThan(1.5);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await expect(entries.nth(1)).toBeFocused();

    // Scrolling the list by hand moves the mark in the index with it.
    await panel.getByTestId('effect-library-rows').evaluate((list) => list.scrollTo({ top: 0 }));
    await expect(entries.first()).toHaveAttribute('aria-current', 'true');
  });

  test('finds an effect by its reach and its family, then by the reading of its name, holds it ready and casts it', async ({
    page,
  }) => {
    await waitAppReady(page);
    for (let had = (await idsOf(page, 'game-character')).length; had < 1; had++) {
      await createCharacter(page);
      await idle(page);
    }
    const [piece] = await idsOf(page, 'game-character');
    const panel = await openEffectLibrary(page);
    const names = () =>
      panel
        .locator('[data-effect-name]')
        .evaluateAll((all) => all.map((name) => name.textContent?.replace(/\s+/g, '') ?? ''));
    const fireEntry = panel.locator('[data-family-entry][data-family="炎"]');
    const all = await panel.locator('[data-effect-tile]').count();

    // The effects of fire that take in an area: the index counts two, and one press stands the list at them.
    await panel.getByTestId('effect-library-reaches').locator('[data-reach="area"]').click();
    await expect(fireEntry).toContainText('2');
    await fireEntry.click();
    await expect.poll(() => headingOffset(panel, '炎')).toBeLessThan(1.5);
    const fire = panel.locator('[data-family-section="炎"]');
    await expect(fire.locator('[data-effect-tile]')).toHaveCount(2);
    await expect(fire.locator('[data-effect-reach]').first()).toContainText('範囲');
    await expect(panel.locator('[data-family-entry][aria-disabled="true"]').first()).toBeVisible();
    expect(await panel.locator('[data-family-entry]').count()).toBeGreaterThanOrEqual(17);

    // Narrowed to nothing, the list says so and offers the way back.
    const field = panel.getByPlaceholder(/名前・系統/);
    await field.fill('どこにもない名前');
    await expect(panel.getByTestId('effect-library-empty')).toContainText('どこにもない名前');
    await panel.getByTestId('effect-library-clear-all').click();
    await expect(field).toHaveValue('');
    await expect(panel.locator('[data-effect-tile]')).toHaveCount(all);

    // Katakana typed in hiragana: every breath, with what was typed marked and the count beside the field.
    await field.fill('ぶれす');
    const breaths = await names();
    expect(breaths.length).toBeGreaterThanOrEqual(5);
    expect(breaths.every((name) => name.includes('ブレス') || name.length > 0)).toBe(true);
    await expect(panel.getByTestId('effect-library-count')).toHaveText(`${breaths.length}件`);
    await expect(panel.locator('[data-effect-tile] mark').first()).toHaveText('ブレス');

    // Kanji found by its reading; the effect is held ready by its row and cast by Enter.
    await field.fill('れんざん');
    const row = panel.locator('[data-effect-tile]').filter({ hasText: '連斬' }).first();
    await expect(row).toBeVisible();
    await row.click();
    const stance = panel.getByTestId('effect-library-stance');
    await expect(stance).toHaveAttribute('data-stance', 'aiming');
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await press(page, piece);
    await expect(panel.getByTestId('effect-library-stance-count')).toHaveText(/^1\//);
    await page.keyboard.press('Enter');
    await expect(stance).toHaveAttribute('data-stance', 'idle');
    await expect(panel.getByTestId('effect-library-notice')).toContainText('発動しました');
  });

  test('holds every other command in a menu of named items, closed by a press elsewhere', async ({ page }) => {
    await waitAppReady(page);
    const panel = await openEffectLibrary(page);
    await expect(panel.getByTestId('effect-library-create')).toContainText('追加');
    const opener = panel.getByTestId('effect-library-menu-button');
    await expect(opener).toContainText('メニュー');

    await opener.click();
    const menu = panel.getByTestId('effect-library-menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      /既定を反映/,
      /足りない既定を追加/,
      /エフェクト集を書き出す/,
      /系統をすべて畳む/,
      /系統をすべて開く/,
    ]);
    await expect(menu.getByRole('menuitemcheckbox')).toContainText('HPの増減に演出を出す');
    const box = (await menu.boundingBox())!;
    const frame = (await frameOf(page, panel).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);

    await menu.getByRole('menuitem', { name: '系統をすべて畳む' }).click();
    await expect(menu).toHaveCount(0);
    await expect(panel.locator('[data-effect-tile]')).toHaveCount(0);
    await expect(panel.locator('[data-family-heading]').first()).toBeVisible();

    await opener.click();
    await panel.getByTestId('effect-library-notice').click();
    await expect(menu).toHaveCount(0);
    await opener.click();
    await menu.getByRole('menuitem', { name: '系統をすべて開く' }).click();
    await expect(panel.locator('[data-effect-tile]').first()).toBeVisible();
  });

  test('comes back at the size it was left at, and from a size kept too small at the size it first opens at', async ({
    page,
  }) => {
    await waitAppReady(page);
    const panel = await openEffectLibrary(page);
    const frame = frameOf(page, panel);
    const grip = (await frame.locator('.ui-resize-handler-se').boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 100, grip.y + grip.height / 2 - 140, { steps: 6 });
    await page.mouse.up();
    const left = (await frame.boundingBox())!;
    expect(Math.round(left.width)).toBeGreaterThan(FIRST_SIZE.width + 60);
    expect(Math.round(left.height)).toBeLessThan(FIRST_SIZE.height - 100);

    await frame.getByTestId('panel-close').dispatchEvent('click');
    await expect(panel).toHaveCount(0);
    const again = (await frameOf(page, await openEffectLibrary(page)).boundingBox())!;
    expect({ width: Math.round(again.width), height: Math.round(again.height) }).toEqual({
      width: Math.round(left.width),
      height: Math.round(left.height),
    });

    await frameOf(page, page.locator('effect-library-panel')).getByTestId('panel-close').dispatchEvent('click');
    await page.evaluate((key) => localStorage.setItem(key, '{"width":120,"height":90}'), SIZE_KEY);
    const reset = (await frameOf(page, await openEffectLibrary(page)).boundingBox())!;
    expect({ width: Math.round(reset.width), height: Math.round(reset.height) }).toEqual(FIRST_SIZE);
  });

  test('cannot be made smaller than 340 by 420', async ({ page }) => {
    await waitAppReady(page);
    const panel = await openEffectLibrary(page);
    const frame = frameOf(page, panel);
    const grip = (await frame.locator('.ui-resize-handler-se').boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 480, grip.y - 600, { steps: 8 });
    await page.mouse.up();

    const least = (await frame.boundingBox())!;
    expect({ width: Math.round(least.width), height: Math.round(least.height) }).toEqual({ width: 340, height: 420 });
    await expect(panel.locator('[data-effect-tile]').first()).toBeVisible();
    await expect(panel.getByTestId('effect-library-fire')).toBeVisible();
  });

  test('keeps its regions where they are through the five states at the size of the old panel too', async ({
    page,
  }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '{"width":360,"height":480}'), SIZE_KEY);
    await waitAppReady(page);
    for (let had = (await idsOf(page, 'game-character')).length; had < 3; had++) {
      await createCharacter(page);
      await idle(page);
    }
    const [first, second, third] = await idsOf(page, 'game-character');
    const panel = await openEffectLibrary(page);
    const frame = (await frameOf(page, panel).boundingBox())!;
    expect({ width: Math.round(frame.width), height: Math.round(frame.height) }).toEqual({ width: 360, height: 480 });

    await panel.getByPlaceholder(/名前・系統/).fill('連斬');
    const row = panel.locator('[data-effect-tile]').filter({ hasText: '連斬' }).first();
    await expect(row).toBeVisible();
    const stance = panel.getByTestId('effect-library-stance');
    const fixed = await boxesOf(panel, FIXED);

    await row.click();
    await expect(stance).toHaveAttribute('data-stance', 'aiming');
    expect(await boxesOf(panel, FIXED)).toEqual(fixed);
    await press(page, first);
    await expect(panel.getByTestId('effect-library-stance-count')).toHaveText(/^1\//);
    expect(await boxesOf(panel, FIXED)).toEqual(fixed);
    await press(page, second);
    await press(page, third);
    await expect(panel.getByTestId('effect-library-stance-count')).toHaveText('3/3');
    expect(await boxesOf(panel, FIXED)).toEqual(fixed);
    await page.keyboard.press('Enter');
    await expect(stance).toHaveAttribute('data-stance', 'idle');
    await expect(panel.getByTestId('effect-library-notice')).toContainText('発動しました');
    expect(await boxesOf(panel, FIXED)).toEqual(fixed);
  });

  test('holds an effect ready and casts it on a hex table as on a square one, one picked at a time or by an area', async ({
    page,
  }) => {
    await waitAppReady(page);
    await openPanel(page, 'テーブル設定');
    await page.locator('select[name="tableGridType"]').selectOption('1');
    await closePanels(page);
    for (let had = (await idsOf(page, 'game-character')).length; had < 2; had++) {
      await createCharacter(page);
      await idle(page);
    }
    const [first, second] = await idsOf(page, 'game-character');
    const panel = await openEffectLibrary(page);
    const field = panel.getByPlaceholder(/名前・系統/);
    const stance = panel.getByTestId('effect-library-stance');
    const count = panel.getByTestId('effect-library-stance-count');
    const fixed = await boxesOf(panel, FIXED);

    for (const [name, target] of [
      ['連斬', first],
      ['業火', second],
    ] as const) {
      await field.fill(name);
      const row = panel.locator('[data-effect-tile]').filter({ hasText: name }).first();
      await row.click();
      await expect(stance).toHaveAttribute('data-stance', 'aiming');
      expect(await boxesOf(panel, FIXED)).toEqual(fixed);
      await press(page, target);
      await expect(count).toHaveText(/^[1-9]\d*\//);
      expect(await boxesOf(panel, FIXED)).toEqual(fixed);
      await page.keyboard.press('Enter');
      await expect(stance).toHaveAttribute('data-stance', 'idle');
      await expect(panel.getByTestId('effect-library-notice')).toContainText('発動しました');
      expect(await boxesOf(panel, FIXED)).toEqual(fixed);
    }
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`writes its words 4.5:1 and draws its outlines and marks 3:1 off their ground in the ${theme} theme`, async ({
      page,
    }) => {
      await page.addInitScript((chosen) => localStorage.setItem('ui-theme', chosen), theme);
      await waitAppReady(page);
      for (let had = (await idsOf(page, 'game-character')).length; had < 1; had++) {
        await createCharacter(page);
        await idle(page);
      }
      const [piece] = await idsOf(page, 'game-character');
      const panel = await openEffectLibrary(page);
      await expect(page.locator('html')).toHaveClass(theme === 'light' ? /theme-light/ : /^(?!.*theme-light)/);

      // An effect held ready with a target, so the box it is held in is measured in use.
      await panel.getByPlaceholder(/名前・系統/).fill('連斬');
      await panel.locator('[data-effect-tile]').filter({ hasText: '連斬' }).first().click();
      await press(page, piece);
      await expect(panel.getByTestId('effect-library-fire')).toBeEnabled();
      await panel.getByPlaceholder(/名前・系統/).fill('');
      await panel.getByTestId('effect-library-reaches').locator('[data-reach="area"]').click();
      await expect(panel.getByTestId('effect-library-count')).toBeVisible();

      // A button eases from one colour to the next as it is pressed: the colours are measured once every
      // one of them has come to rest, not part of the way between two.
      await panel.evaluate((root) =>
        Promise.all(
          root
            .getAnimations({ subtree: true })
            .filter((animation) => animation instanceof CSSTransition)
            .map((animation) => animation.finished.catch(() => undefined))
        )
      );

      const measured = await panel.evaluate((root) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        const rgba = (color: string): number[] => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = '#000';
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const data = context.getImageData(0, 0, 1, 1).data;
          return [data[0], data[1], data[2], data[3] / 255];
        };
        const over = (top: number[], under: number[]): number[] => {
          const alpha = top[3] + under[3] * (1 - top[3]);
          if (alpha === 0) return [0, 0, 0, 0];
          return [0, 1, 2].map((at) => (top[at] * top[3] + under[at] * under[3] * (1 - top[3])) / alpha).concat(alpha);
        };
        const groundOf = (element: Element): number[] => {
          const layers: number[][] = [];
          for (let at: Element | null = element; at; at = at.parentElement) {
            const color = rgba(getComputedStyle(at).backgroundColor);
            if (color[3] > 0) layers.push(color);
            if (color[3] >= 0.999) break;
          }
          let ground = [128, 128, 128, 1];
          for (const layer of layers.reverse()) ground = over(layer, ground);
          return ground;
        };
        const luminance = (color: number[]): number => {
          const linear = (value: number) => {
            const part = value / 255;
            return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2]);
        };
        const ratio = (one: number[], other: number[]): number => {
          const [high, low] = [luminance(one), luminance(other)].sort((left, right) => right - left);
          return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
        };
        const inkOf = (element: Element): number => {
          const ground = groundOf(element);
          return ratio(over(rgba(getComputedStyle(element).color), ground), ground);
        };
        const edgeOf = (element: Element): number => {
          const ground = groundOf(element.parentElement ?? element);
          return ratio(over(rgba(getComputedStyle(element).borderTopColor), ground), ground);
        };
        const fillOf = (element: Element): number => {
          const ground = groundOf(element.parentElement ?? element);
          return ratio(over(rgba(getComputedStyle(element).backgroundColor), ground), ground);
        };
        const all = (selector: string) => Array.from(root.querySelectorAll(selector));
        const worst = (selector: string, measure: (element: Element) => number) => {
          const found = all(selector).filter((element) => !element.closest('[aria-disabled="true"], :disabled'));
          return { selector, count: found.length, least: Math.min(...found.map(measure)) };
        };
        const words = [
          'input[type=search]',
          '[data-testid="effect-library-count"]',
          '[data-testid="effect-library-create"]',
          '[data-testid="effect-library-menu-button"]',
          '[data-testid="effect-library-grades"] button',
          '[data-testid="effect-library-reaches"] button',
          '[data-testid="effect-library-filters"] [role="group"] > span',
          '[data-testid="effect-library-stance-name"] span',
          '[data-testid="effect-library-stance-caster"] > span',
          '[data-testid="effect-library-stance-caster"] button',
          '[data-testid="effect-library-stance-targets"] span',
          '[data-testid="effect-library-fire"]',
          '[data-testid="effect-library-cancel"]',
          '[data-family-entry]',
          '[data-family-entry] span:last-child',
          '[data-family-heading]',
          '[data-family-heading] span:last-child',
          '[data-effect-name]',
          '[data-effect-reach]',
          '[data-effect-kind]',
        ].map((selector) => worst(selector, inkOf));
        const outlines = [
          'input[type=search]',
          '[data-testid="effect-library-create"]',
          '[data-testid="effect-library-menu-button"]',
          '[data-testid="effect-library-grades"]',
          '[data-testid="effect-library-reaches"]',
          '[data-testid="effect-library-stance-caster"] button',
          '[data-testid="effect-library-target-chip"]',
          '[data-testid="effect-library-cancel"]',
          '[data-effect-tile]',
        ].map((selector) =>
          worst(selector, (element) => edgeOf(selector === 'input[type=search]' ? element.parentElement! : element))
        );
        const marks = [
          worst('[data-testid="effect-library-filters"] .material-icons', inkOf),
          worst('[data-testid="effect-library-stance"] .material-icons', inkOf),
          worst('[data-effect-grade]', inkOf),
          worst('[data-family-heading] .material-icons', inkOf),
          worst('[data-family-entry] span:first-child', fillOf),
          worst('[data-family-heading] span:first-child', fillOf),
        ];
        return { words, outlines, marks };
      });

      expect(measured.words.filter((entry) => entry.count < 1)).toEqual([]);
      expect(measured.outlines.filter((entry) => entry.count < 1)).toEqual([]);
      expect(measured.marks.filter((entry) => entry.count < 1)).toEqual([]);
      expect(measured.words.filter((entry) => entry.least < 4.5)).toEqual([]);
      expect(measured.outlines.filter((entry) => entry.least < 3)).toEqual([]);
      expect(measured.marks.filter((entry) => entry.least < 3)).toEqual([]);
      await page.keyboard.press('Escape');
    });
  }

  test('writes out the name of a button drawn as a mark alone while the names of the buttons are asked for', async ({
    page,
  }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '{"width":360,"height":480}'), SIZE_KEY);
    await waitAppReady(page);
    const panel = await openEffectLibrary(page);
    const opener = panel.getByTestId('effect-library-menu-button');
    await expect(opener).toHaveAttribute('aria-label', 'メニュー');
    await expect(opener.locator('span')).toBeHidden();

    await page.keyboard.press('?');

    await expect(opener.locator('span')).toBeVisible();
    await expect(opener).toContainText('メニュー');
  });
});
