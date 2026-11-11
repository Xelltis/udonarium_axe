import { expect, Locator, Page, test } from '@playwright/test';

import { openPanel, panelAtRest, waitAppReady } from './helpers';

async function becomeGm(page: Page) {
  await page
    .locator('ui-panel')
    .filter({ hasText: '接続情報' })
    .getByRole('button', { name: /^\s*GM\s*$/ })
    .click();
  await expect(page.locator('app-gm-toolbar button').first()).toBeVisible({ timeout: 10000 });
}

/** A point on the part of a face that shows, however far the faces after it lie over it. */
async function onFace(face: Locator): Promise<{ x: number; y: number }> {
  const box = (await face.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + 3 };
}

test.describe('the turn order shrunk from the inventory', () => {
  test.use({ viewport: { width: 1280, height: 640 } });

  test('lays every piece within the screen, and hands the turn to any of them with one press or a slide', async ({
    page,
  }) => {
    await waitAppReady(page);
    await becomeGm(page);
    await openPanel(page, 'インベントリ');
    const panel = page.locator('ui-panel').filter({ has: page.locator('game-object-inventory') });
    await panel.locator('button[title="リッチ表示"]').dispatchEvent('click');
    await panel.locator('button[title="簡略表示（表）"]').dispatchEvent('click');
    const round = page.locator('inventory-round-view');
    const strip = round.getByTestId('turn-pieces');
    await expect(strip).toBeVisible();
    const next = round.getByRole('button', { name: '次へ', exact: true });
    for (let turn = 0; turn < 4; turn++) await next.dispatchEvent('click');
    // The faces move to where they come to stand as the turn passes on.
    await panelAtRest(strip);

    const faces = round.locator('[data-turn-piece]');
    const count = await faces.count();
    expect(count).toBeGreaterThan(10);
    await expect
      .poll(async () => {
        const box = (await strip.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(640);

    const last = faces.nth(count - 1);
    const lastName = (await last.getAttribute('aria-label'))!.split(' / ')[0];
    const lastAt = await onFace(last);
    await page.mouse.move(lastAt.x, lastAt.y);
    const peek = page.getByTestId('turn-peek');
    await expect(peek).toBeVisible();
    await expect(peek.getByTestId('turn-peek-name')).toHaveText(lastName);
    await page.mouse.down();
    await page.mouse.up();
    await expect(last).toHaveAttribute('data-current', 'true');
    await panelAtRest(strip);

    const from = await onFace(faces.nth(1));
    const target = faces.nth(count - 4);
    const targetName = (await target.getAttribute('aria-label'))!.split(' / ')[0];
    const to = await onFace(target);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await expect(peek.getByTestId('turn-peek-name')).toHaveText(targetName);
    await page.mouse.up();
    await expect(round.locator(`[data-turn-piece][data-current]`)).toHaveAttribute(
      'aria-label',
      new RegExp(`^${targetName}`)
    );

    await panel.getByRole('button', { name: '行動順を横に並べる' }).click();
    await expect(strip).toHaveAttribute('data-across', 'true');
    const across = (await panel.locator('.draggable-panel').boundingBox())!;
    expect(across.x + across.width).toBeLessThanOrEqual(1280);
    await expect(faces).toHaveCount(count);
  });
});
