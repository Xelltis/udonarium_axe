import { expect, test } from '@playwright/test';

test.describe('スマートフォンで開くコマの簡易表示', () => {
  test('コマをタップして出た簡易表示で、リソースをスライダーで動かせること', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-mobile-shell nav')).toBeVisible({ timeout: 20000 });
    const closeStartupPanel = page.locator('ui-panel .bg-ui-titlebar button').last();
    if (await closeStartupPanel.count()) await closeStartupPanel.tap();

    // The one character wholly on a phone's screen at the start.
    const piece = page.locator('game-character').filter({ hasText: 'キャラクターC' }).first();
    await piece.dispatchEvent('contextmenu');
    await page.locator('context-menu').getByText('詳細を表示').tap();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // The HP row is the first resource of the first section. On a phone its settings are in the
    // editor its "⋯" opens.
    await sheet.getByRole('button', { name: 'edit', exact: true }).first().tap();
    await sheet.getByTestId('row-more').first().tap();
    const editor = page.getByTestId('field-editor');
    await expect(editor).toBeVisible();
    await editor.locator('input[name="data-resource-slider"]').tap();
    await expect(editor.locator('input[name="data-resource-slider"]')).toBeChecked();
    await page.getByTestId('bottom-sheet-close').tap();
    await expect(editor).toHaveCount(0);
    await sheet.getByRole('button', { name: 'edit_off', exact: true }).first().tap();
    await sheet.getByTestId('resource-slider').first().fill('5');
    await page
      .locator('ui-panel', { has: sheet })
      .locator('button:has(i:text-is("close"))')
      .last()
      .dispatchEvent('click');
    await expect(sheet).toHaveCount(0);

    // The piece is tapped with touches alone. The emulated phone keeps a mouse at the corner of the
    // screen, and a real tap's mouse events go back to it, which reads as leaving the piece.
    // WebKit will not build a Touch, so the touch is a plain object on a plain event.
    const picture = piece.locator('img.image').first();
    const box = (await picture.boundingBox())!;
    await picture.evaluate(
      (target, point) => {
        const touch = { identifier: 1, target, clientX: point.x, clientY: point.y, pageX: point.x, pageY: point.y };
        const send = (type: string, touches: object[]) => {
          const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
          Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: [touch] } });
          target.dispatchEvent(event);
        };
        send('touchstart', [touch]);
        send('touchend', []);
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    );
    const slider = page.getByTestId('overview-resource-slider').first();
    await expect(slider).toBeVisible({ timeout: 5000 });
    await expect(slider).toHaveValue('5');

    // A tap near the far end of the track moves the thumb there.
    const track = (await slider.boundingBox())!;
    await page.touchscreen.tap(track.x + track.width * 0.9, track.y + track.height / 2);
    await expect(page.locator('overview-panel input[name="data-current-value"]').first()).not.toHaveValue('5');
    await expect(slider).toBeVisible();
  });
});
