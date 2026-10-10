import { expect, test } from '@playwright/test';

import { openCharacterSheet, row, sectionCard } from './sheet-helpers';

test.describe('スマートフォンで読むキャラクターシート', () => {
  test('横にはみ出さず、立ち絵の列の代わりに見出しが出ること', async ({ page }) => {
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

  test('セクションの並びから押したセクションへ飛べること', async ({ page }) => {
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

  test('畳んだセクションが開き直しても畳まれたままであること', async ({ page }) => {
    const sheet = await openCharacterSheet(page);
    const title = sectionCard(sheet, '能力').getByTestId('sheet-card-title');

    await title.tap();
    await expect(title).toHaveAttribute('aria-expanded', 'false');
    await expect(row(sectionCard(sheet, '能力'), '器用度')).toHaveCount(0);

    await page
      .locator('ui-panel', { has: sheet })
      .locator('button:has(i:text-is("close"))')
      .last()
      .dispatchEvent('click');
    await expect(sheet).toHaveCount(0);
    const reopened = await openCharacterSheet(page);

    await expect(sectionCard(reopened, '能力').getByTestId('sheet-card-title')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  test('± で HP を増減できること', async ({ page }) => {
    const sheet = await openCharacterSheet(page);
    const hp = row(sheet, 'HP');
    const current = hp.locator('input[name="data-current-value"]');
    const before = Number(await current.inputValue());

    await hp.getByTestId('step-down').tap();
    await hp.getByTestId('step-down').tap();

    await expect(current).toHaveValue(String(before - 2));
    await expect(hp.getByTestId('step-up')).toBeEnabled();
  });

  test('表を横に送っても行の見出しが左に残ること', async ({ page }) => {
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
