import { expect, Page, test } from '@playwright/test';

import { chatInput, revealMenuEntry, waitAppReady } from './helpers';

/** Marks a piece of the starting table as a target, from its menu. */
async function markTarget(page: Page, identifier: string) {
  await page.locator(`game-character[data-object-id="${identifier}"]`).first().dispatchEvent('contextmenu');
  const menu = page.locator('context-menu');
  await expect(menu.locator('li').first()).toBeVisible({ timeout: 7000 });
  await (await revealMenuEntry(page, menu, 'ターゲット', true)).click();
}

/**
 * A line aimed at the pieces marked all at once, as an area spell is cast: rolled once for them all,
 * with all their names after its answer, rather than once for each of them.
 */
test('rolls a line aimed with t:範囲 once for every marked piece, naming them all after its answer', async ({
  page,
}) => {
  await waitAppReady(page);
  await markTarget(page, 'testCharacter_1');
  await markTarget(page, 'testCharacter_2');

  const input = chatInput(page).first();
  await input.fill('2d6+5 魔法行使 t:範囲');
  await input.press('Enter');

  const answers = page.locator('chat-message').filter({ hasText: '2D6+5' });
  await expect(answers.last()).toContainText(/\[モンスター[AB]、モンスター[AB]\]/, { timeout: 15000 });
  await expect(answers).toHaveCount(1);
  await expect(page.locator('chat-message').filter({ hasText: '魔法行使' }).last()).not.toContainText('t:範囲');
});
