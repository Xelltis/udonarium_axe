import { expect, Locator, Page } from '@playwright/test';

import { sendMenuEvent, waitMobileReady } from '../helpers';

/**
 * Opens キャラクターC's sheet on a phone, the way a player does: a press held on the piece and
 * "詳細を表示". Returns the sheet.
 */
export async function openCharacterSheet(page: Page): Promise<Locator> {
  await waitMobileReady(page);

  const piece = page.locator('game-character').filter({ hasText: 'キャラクターC' }).first();
  await sendMenuEvent(piece);
  await page.locator('context-menu').getByText('詳細を表示').tap();
  const sheet = page.locator('game-character-sheet');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  return sheet;
}

/** The card of the sheet's section with this name. */
export function sectionCard(sheet: Locator, name: string): Locator {
  return sheet.locator('[data-card-id]').filter({
    has: sheet
      .page()
      .getByTestId('sheet-card-title')
      .filter({ hasText: exactly(name) }),
  });
}

/** The field row of a sheet with this name, read or being edited. */
export function row(scope: Locator, name: string): Locator {
  return scope
    .locator('[data-gde-id]:has(> .elm-name-cell)')
    .filter({
      has: scope
        .page()
        .locator('.elm-name-cell')
        .filter({ hasText: exactly(name) }),
    })
    .first();
}

function exactly(text: string): RegExp {
  return new RegExp(`^\\s*(expand_more)?\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
}
