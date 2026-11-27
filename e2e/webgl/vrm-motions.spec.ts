import { expect, test } from '@playwright/test';

import { armLiftVrma, boxVrm } from '../glb-helpers';
import { closePanels, revealMenuEntry, rightClickPiece, waitAppReady } from '../helpers';

/**
 * Motions for VRM models (`.vrma`) brought into the room and given to a VRM a piece is drawn as: the
 * VRM plays them as motions of its own, chosen for standing and played from the piece's menu.
 */
test.describe('motions for VRM models', () => {
  test('gives a VRM a motion dropped in, which it then stands in and plays from the piece’s menu', async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
    const piece = page.locator('game-character').filter({ hasText: 'キャラクターB' }).first();

    await page.evaluate(
      ({ vrm, vrma }) => {
        const carried = new DataTransfer();
        const bytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        carried.items.add(new File([bytes(vrm)], 'box.vrm'));
        carried.items.add(new File([bytes(vrma)], 'arm-lift.vrma'));
        const drop = { bubbles: true, cancelable: true, clientX: 600, clientY: 400, dataTransfer: carried };
        document.body.dispatchEvent(new DragEvent('drop', drop));
      },
      { vrm: boxVrm().toString('base64'), vrma: armLiftVrma().toString('base64') }
    );

    await rightClickPiece(piece);
    await page.locator('context-menu').getByText('詳細を表示').click();
    const sheet = page.locator('game-character-sheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await sheet.locator('button:has(i:text-is("settings"))').first().click();
    const choice = sheet.getByTestId('piece-model');
    await expect(choice.locator('option', { hasText: 'box.vrm' })).toHaveCount(1, { timeout: 15000 });
    await expect(choice.locator('option', { hasText: 'arm-lift' })).toHaveCount(0);
    await choice.selectOption({ label: 'box.vrm' });
    await sheet.getByTestId('piece-model-setup').locator('summary').click();

    const give = sheet.getByTestId('model-give-motion');
    await expect(give).toBeVisible({ timeout: 15000 });
    await give.selectOption({ label: 'arm-lift' });
    await expect(sheet.getByTestId('model-given-motion')).toContainText('arm-lift');
    await expect(sheet.getByTestId('piece-model-idle').locator('option').first()).toContainText('arm-lift');
    await page.locator('ui-panel', { has: sheet }).getByTestId('panel-close').first().dispatchEvent('click');
    await expect(sheet).toHaveCount(0);
    // The VRM is drawn, read with the motion made over for its bones.
    await expect.poll(() => page.evaluate(() => window.__axeTable.sceneStats()?.models ?? -1)).toBe(1);

    await rightClickPiece(piece);
    const menu = page.locator('context-menu');
    await expect(menu.locator('li').first()).toBeVisible({ timeout: 5000 });
    await (await revealMenuEntry(page, menu, 'モデルの動き')).hover();
    await expect(menu.getByText('arm-lift', { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
