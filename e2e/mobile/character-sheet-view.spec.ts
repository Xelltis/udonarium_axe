import { expect, test } from '@playwright/test';

import { openCharacterSheet, sectionCard } from './sheet-helpers';

test.describe('reading a character sheet on a phone', () => {
  test('does not overflow sideways, and shows a heading in place of the portrait column', async ({ page }) => {
    const sheet = await openCharacterSheet(page);

    await expect(sheet.getByTestId('sheet-compact-header')).toBeVisible();
    await expect(sheet.getByTestId('sheet-compact-header')).toContainText('キャラクターC');
    await expect(sheet.locator('character-portrait-panel')).toBeHidden();
    const overflow = await sheet.evaluate((element) => {
      const scroller = element.closest('.overflow-auto')!;
      return scroller.scrollWidth - scroller.clientWidth;
    });
    expect(overflow).toBe(0);
  });

  test('jumps to the section pressed in the row of sections', async ({ page }) => {
    const sheet = await openCharacterSheet(page);
    const chips = sheet.getByTestId('sheet-section-chips');

    await chips.getByRole('button', { name: 'パーツ', exact: true }).tap();

    const card = sectionCard(sheet, 'パーツ');
    await expect(card).toBeInViewport();
    await expect(chips.getByRole('button', { name: 'パーツ', exact: true })).toHaveAttribute('aria-current', 'true');
    // Still lit once the scroll has settled at the bottom of the sheet.
    await page.waitForTimeout(1500);
    await expect(chips.getByRole('button', { name: 'パーツ', exact: true })).toHaveAttribute('aria-current', 'true');
  });

  test('keeps the row headings at the left as the table scrolls sideways', async ({ page }) => {
    const sheet = await openCharacterSheet(page);
    const table = sectionCard(sheet, '技能表').locator('.elm-view-table');
    await table.scrollIntoViewIfNeeded();
    const heading = table.locator('tbody th').first();
    const before = (await heading.boundingBox())!.x;

    await table.evaluate((element) => {
      element.parentElement!.scrollLeft = 240;
    });

    await expect.poll(async () => Math.abs((await heading.boundingBox())!.x - before)).toBeLessThan(1.5);
  });
});
