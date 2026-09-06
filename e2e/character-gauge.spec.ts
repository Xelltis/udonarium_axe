import { expect, Locator, Page, test } from '@playwright/test';

import { createCharacter, waitAppReady } from './helpers';

function newCharacterPiece(page: Page) {
  return page.locator('game-character').filter({ hasText: '新しいキャラクター' }).first();
}

async function openSheet(page: Page) {
  await newCharacterPiece(page).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('詳細を表示').click();
  const sheet = page.locator('game-character-sheet');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  return sheet;
}

async function selectBuffView(page: Page, label: string) {
  await newCharacterPiece(page).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('バフの表示').hover();
  const item = menu.getByText(new RegExp(`^(✔ )?${label}$`));
  await expect(item).toBeVisible({ timeout: 5000 });
  await item.click();
  await expect(page.locator('context-menu')).toHaveCount(0, { timeout: 5000 });
}

async function addBuff(page: Page, count = 1) {
  await newCharacterPiece(page).dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
  await menu.getByText('バフ編集').click();
  const view = page.locator('game-character-buff-view');
  await expect(view).toBeVisible({ timeout: 5000 });
  for (let i = 0; i < count; i++) await view.getByRole('button', { name: /バフを追加/ }).click();
  await expect(view.locator('[game-data-element-buff]').first()).toBeVisible({ timeout: 5000 });
}

function resourceRows(sheet: Locator, page: Page) {
  return sheet
    .locator('game-data-element, [game-data-element]')
    .filter({ has: page.locator('input[name="data-current-value"]') })
    .filter({ hasNot: page.locator('game-data-element, [game-data-element]') });
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  return rect!;
}

test.describe('コマの頭上表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ui-lang', 'ja');
      // The badges slide in over 160ms, and the geometry checks below measure the three of
      // them one at a time. Measured mid-slide they never agree, so hold the motion still.
      localStorage.setItem('ui-motion', 'off');
    });
    await waitAppReady(page);
    await createCharacter(page);
  });

  test('既定で HP と MP のバーが出て、シートの編集から外せること', async ({ page }) => {
    const gauges = newCharacterPiece(page).locator('[data-testid="piece-gauge"]');
    await expect(gauges).toHaveCount(2);

    const sheet = await openSheet(page);
    await sheet.locator('button[title="編集"]').first().dispatchEvent('click');
    const row = resourceRows(sheet, page).first();
    await row.locator('button[title="詳細設定"]').first().dispatchEvent('click');

    const gaugeToggle = row.locator('input[name="data-piece-gauge"]');
    await expect(gaugeToggle).toBeChecked({ timeout: 5000 });

    await gaugeToggle.uncheck();
    await expect(gauges).toHaveCount(1, { timeout: 5000 });
  });

  test('リソース行の操作ボタンが 1 段に収まること', async ({ page }) => {
    const sheet = await openSheet(page);
    await sheet.locator('button[title="編集"]').first().dispatchEvent('click');

    const actions = resourceRows(sheet, page).first().locator('.elm-row-actions').first();
    await expect(actions).toBeVisible({ timeout: 5000 });
    const cluster = await box(actions);
    const buttons = actions.locator('button:visible');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(3);

    const tops: number[] = [];
    for (let i = 0; i < count; i++) tops.push((await box(buttons.nth(i))).y);
    expect(Math.max(...tops) - Math.min(...tops), '操作ボタンが 2 段に折り返している').toBeLessThan(6);
    expect(cluster.height, '操作ボタンの帯が 2 段ぶんの高さになっている').toBeLessThan(34);

    const panel = await box(sheet);
    expect(cluster.x + cluster.width, '操作ボタンがシートからはみ出している').toBeLessThanOrEqual(
      panel.x + panel.width + 1
    );
  });

  test('バフ・バー・名前がコマの真上に詰めて積まれること', async ({ page }) => {
    await addBuff(page);
    const piece = newCharacterPiece(page);

    const badge = await box(piece.locator('[data-testid="buff-badge"]').first());
    const gauge = await box(piece.locator('[data-testid="piece-gauge"]').first());
    const lastGauge = await box(piece.locator('[data-testid="piece-gauge"]').last());
    const name = await box(piece.locator('[data-testid="piece-name"]'));

    expect(badge.y).toBeLessThan(gauge.y);
    expect(lastGauge.y).toBeLessThan(name.y);

    expect(gauge.y - (badge.y + badge.height)).toBeLessThan(14);
    expect(name.y - (lastGauge.y + lastGauge.height)).toBeLessThan(12);
    expect(name.y + name.height - badge.y).toBeLessThan(110);

    expect(badge.width).toBeGreaterThan(8);
    expect(badge.width).toBeLessThan(22);
    expect(name.height).toBeLessThan(34);

    expect(Math.abs(badge.x - gauge.x), 'バフがリソースバーの開始位置から始まっていない').toBeLessThan(6);
    expect(gauge.width, 'リソースバーがキャラ名に比べて細すぎる').toBeGreaterThan(name.width * 0.7);
    expect(gauge.width, 'リソースバーがキャラ名に比べて広すぎる').toBeLessThan(name.width * 1.6);
  });

  test('右クリックメニューから表示を切り替えられること', async ({ page }) => {
    await addBuff(page, 2);
    const piece = newCharacterPiece(page);
    const badges = piece.locator('[data-testid="buff-badge"]');
    await expect(badges.first()).toBeAttached({ timeout: 10000 });
    await expect(badges).toHaveCount(2, { timeout: 10000 });

    const movable = piece.locator('> div').first();
    const before = await movable.evaluate((element) => (element as HTMLElement).style.transform);

    await selectBuffView(page, '詳細');
    await expect(badges).toHaveCount(0, { timeout: 5000 });
    await expect(piece.locator('[game-data-element-buff]').filter({ hasText: 'R' }).first()).toBeVisible({
      timeout: 5000,
    });

    await selectBuffView(page, '個数');
    await expect(piece.getByText(/バフ2個/)).toBeVisible({ timeout: 5000 });

    await selectBuffView(page, 'アイコン');
    await expect(badges).toHaveCount(2, { timeout: 5000 });

    expect(await movable.evaluate((element) => (element as HTMLElement).style.transform)).toBe(before);
  });

  test('名前ラベルを掴むとコマだけが動くこと', async ({ page }) => {
    const piece = newCharacterPiece(page);
    const other = page.locator('game-character').filter({ hasText: 'モンスターA' }).first();
    const name = piece.locator('[data-testid="piece-name"]');

    const start = await box(name);
    const otherStart = await box(other);

    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 40, start.y + start.height / 2 + 30, { steps: 5 });
    await page.mouse.move(start.x + start.width / 2 + 120, start.y + start.height / 2 + 80, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(
        async () => {
          const moved = await box(name);
          const otherNow = await box(other);
          return Math.hypot(
            moved.x - otherNow.x - (start.x - otherStart.x),
            moved.y - otherNow.y - (start.y - otherStart.y)
          );
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(10);
  });

  test('バフのバッジが横に並ぶこと', async ({ page }) => {
    await addBuff(page, 3);
    const badges = newCharacterPiece(page).locator('[data-testid="buff-badge"]');
    await expect(badges.first()).toBeAttached({ timeout: 10000 });
    await expect(badges).toHaveCount(3, { timeout: 10000 });

    const first = await box(badges.nth(0));
    const second = await box(badges.nth(1));
    const third = await box(badges.nth(2));

    expect(Math.abs(second.y - first.y)).toBeLessThan(first.height * 0.6);
    expect(Math.abs(third.y - first.y)).toBeLessThan(first.height * 0.6);
    expect(second.x - first.x).toBeGreaterThan(first.width * 0.8);
    expect(third.x - second.x).toBeGreaterThan(first.width * 0.8);
  });

  test('バフが多くても重ならず、横に並んでから折り返すこと', async ({ page }) => {
    await addBuff(page, 8);
    const piece = newCharacterPiece(page);
    const badges = piece.locator('[data-testid="buff-badge"]');
    await expect(badges.first()).toBeAttached({ timeout: 10000 });
    await expect(badges).toHaveCount(8, { timeout: 10000 });

    const gauge = await box(piece.locator('[data-testid="piece-gauge"]').first());

    const boxes = [];
    for (let i = 0; i < 8; i++) boxes.push(await box(badges.nth(i)));

    for (const [index, badge] of boxes.entries()) {
      expect(overlaps(badge, gauge), `badge ${index} とリソースバーが重なっている`).toBe(false);
      expect(badge.y + badge.height).toBeLessThanOrEqual(gauge.y + 1);
      for (const [otherIndex, other] of boxes.entries()) {
        if (otherIndex <= index) continue;
        expect(overlaps(badge, other), `badge ${index} と ${otherIndex} が重なっている`).toBe(false);
      }
    }

    const rows = new Set(boxes.map((badge) => Math.round(badge.y)));
    expect(rows.size).toBeGreaterThan(1);
    expect(rows.size).toBeLessThan(boxes.length);
    expect(overlaps(await box(piece.locator('[data-testid="buff-plate"]')), gauge)).toBe(false);
  });

  test('詳細表示でもリソースバーに重ならないこと', async ({ page }) => {
    await addBuff(page, 3);
    const piece = newCharacterPiece(page);
    await selectBuffView(page, '詳細');

    const rows = piece.locator('[game-data-element-buff]').filter({ hasText: 'R' });
    await expect(rows.first()).toBeVisible({ timeout: 5000 });

    const gauge = await box(piece.locator('[data-testid="piece-gauge"]').first());
    const name = await box(piece.locator('[data-testid="piece-name"]'));
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = await box(rows.nth(i));
      expect(overlaps(row, gauge), `詳細 ${i} 行目がリソースバーに重なっている`).toBe(false);
      expect(overlaps(row, name), `詳細 ${i} 行目が名前に重なっている`).toBe(false);
      expect(row.width).toBeGreaterThan(40);
    }
  });

  test('残ラウンドがアイコンの右下に重なること', async ({ page }) => {
    await addBuff(page, 2);
    const piece = newCharacterPiece(page);
    const badge = piece.locator('[data-testid="buff-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 10000 });

    const icon = await box(badge);
    const rounds = await box(badge.locator('[data-testid="buff-rounds"]'));

    expect(overlaps(icon, rounds), '残ラウンドがアイコンに重なっていない').toBe(true);
    expect(rounds.x + rounds.width / 2).toBeGreaterThan(icon.x + icon.width / 2);
    expect(rounds.y + rounds.height / 2).toBeGreaterThan(icon.y + icon.height / 2);
    expect(rounds.width).toBeLessThan(icon.width * 0.9);
  });

  test('詳細表示が折り返さないこと', async ({ page }) => {
    await addBuff(page, 3);
    const piece = newCharacterPiece(page);
    await selectBuffView(page, '詳細');

    const rows = piece.locator('[game-data-element-buff]').filter({ hasText: 'R' });
    await expect(rows.first()).toBeVisible({ timeout: 5000 });

    const count = await rows.count();
    const heights: number[] = [];
    for (let i = 0; i < count; i++) heights.push((await box(rows.nth(i))).height);

    const shortest = Math.min(...heights);
    for (const height of heights) expect(height).toBeLessThan(shortest * 1.4);

    for (let i = 0; i < count; i++) {
      const clipped = await rows
        .nth(i)
        .locator('span')
        .first()
        .evaluate((element) => {
          const el = element as HTMLElement;
          return el.scrollWidth - el.clientWidth;
        });
      expect(clipped, `詳細 ${i} 行目が省略されている`).toBeLessThanOrEqual(1);
    }

    const plate = await box(piece.locator('[data-testid="buff-plate"]'));
    const gauge = await box(piece.locator('[data-testid="piece-gauge"]').first());
    const name = await box(piece.locator('[data-testid="piece-name"]'));
    expect(overlaps(plate, gauge), '詳細パネルがリソースバーに重なっている').toBe(false);
    expect(overlaps(plate, name), '詳細パネルが名前に重なっている').toBe(false);

    const first = await box(rows.first());
    for (let i = 0; i < count; i++) {
      const row = await box(rows.nth(i));
      expect(Math.abs(row.x - first.x), `詳細 ${i} 行目の左端が揃っていない`).toBeLessThan(2);
      expect(row.x - plate.x, `詳細 ${i} 行目が左に寄りすぎている`).toBeGreaterThan(-2);
    }
  });

  test('リソースが減ると赤い数字が飛び出すこと', async ({ page }) => {
    const piece = newCharacterPiece(page);
    const sheet = await openSheet(page);

    const current = sheet.locator('input[name="data-current-value"]').first();
    await expect(current).toBeVisible({ timeout: 5000 });
    await current.fill('150');
    await current.blur();

    const change = piece.locator('[data-testid="resource-change"]').first();
    await expect(change).toBeVisible({ timeout: 5000 });
    await expect(piece.locator('[data-testid="piece-body"]')).toHaveClass(/animate-hit-shake/);
    await expect(change).toHaveText('-50');
    await expect(change).toHaveAttribute('data-kind', 'damage');
    await expect(piece.locator('[data-testid="hit-flash"]')).toBeAttached();

    await expect(piece.locator('[data-testid="resource-change"]')).toHaveCount(0, { timeout: 5000 });
  });

  test('マイナスリソースでは増減の意味が裏返ること', async ({ page }) => {
    const piece = newCharacterPiece(page);
    const sheet = await openSheet(page);
    await sheet.locator('button[title="編集"]').first().dispatchEvent('click');

    const row = resourceRows(sheet, page).first();
    await row.locator('button[title="詳細設定"]').first().dispatchEvent('click');
    await row.locator('input[name="data-gauge-inverted"]').check();

    const current = sheet.locator('input[name="data-current-value"]').first();
    await current.fill('150');
    await current.blur();

    const change = piece.locator('[data-testid="resource-change"]').first();
    await expect(change).toBeVisible({ timeout: 5000 });
    await expect(change).toHaveText('-50');
    await expect(change).toHaveAttribute('data-kind', 'heal');
    await expect(piece.locator('[data-testid="heal-aura"]')).toBeAttached();
  });

  test('リソースが増えると緑の数字が飛び出すこと', async ({ page }) => {
    const piece = newCharacterPiece(page);
    const sheet = await openSheet(page);

    const current = sheet.locator('input[name="data-current-value"]').first();
    await expect(current).toBeVisible({ timeout: 5000 });
    await current.fill('120');
    await current.blur();
    await expect(piece.locator('[data-testid="resource-change"]').first()).toBeVisible({ timeout: 5000 });
    await expect(piece.locator('[data-testid="resource-change"]')).toHaveCount(0, { timeout: 5000 });

    await current.fill('180');
    await current.blur();

    const change = piece.locator('[data-testid="resource-change"]').first();
    await expect(change).toBeVisible({ timeout: 5000 });
    await expect(change).toHaveText('+60');
    await expect(change).toHaveAttribute('data-kind', 'heal');
    await expect(piece.locator('[data-testid="heal-aura"]')).toBeAttached();
  });
});
