import { expect, Locator, Page, test } from '@playwright/test';

import { waitMobileReady } from '../helpers';

/** The list of effects on a phone: every part that is pressed is large enough for a finger, and nothing runs off the side. */

/** The least a part pressed by a finger measures, each way. */
const FINGER = 44;

/** Opens the list of effects from the phone's menu. */
async function openEffectLibrary(page: Page): Promise<Locator> {
  await waitMobileReady(page);
  await page.locator('mobile-shell nav button').last().click();
  await page.locator('mobile-shell li button').filter({ hasText: 'エフェクト' }).first().click();
  const panel = page.locator('effect-library-panel');
  await expect(panel.locator('[data-effect-tile]').first()).toBeVisible({ timeout: 20000 });
  return panel;
}

/** The parts found by a selector that measure less than a finger's breadth either way, by what each says. */
function tooSmall(panel: Locator, selector: string): Promise<string[]> {
  return panel.locator(selector).evaluateAll(
    (parts, least) =>
      parts
        .map((part) => ({ part, box: part.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && (box.width < least - 0.5 || box.height < least - 0.5))
        .map(({ part, box }) => `${part.textContent?.trim().slice(0, 12)} ${box.width}x${box.height}`),
    FINGER
  );
}

test.describe('the list of effects on a phone', () => {
  test('fills the screen with parts a finger can press, a list for the grade and one for the reach, and no sideways scrolling', async ({
    page,
  }) => {
    const panel = await openEffectLibrary(page);

    for (const selector of [
      '[data-testid="effect-library-create"]',
      '[data-testid="effect-library-menu-button"]',
      '[data-testid="effect-library-grade-select"]',
      '[data-testid="effect-library-reach-select"]',
      '[data-family-entry]',
      '[data-effect-tile]',
      '[data-effect-more]',
      '[data-testid="effect-library-fire"]',
      '[data-testid="effect-library-cancel"]',
    ]) {
      expect(await panel.locator(selector).count(), selector).toBeGreaterThan(0);
      expect(await tooSmall(panel, selector), selector).toEqual([]);
    }
    await expect(panel.getByTestId('effect-library-reaches')).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const wide = await panel.evaluate((root) => root.scrollWidth - root.clientWidth);
    expect(wide).toBeLessThanOrEqual(0);

    // The names of the shelf are whole, one row across.
    const cut = await panel
      .locator('[data-effect-name]')
      .evaluateAll((names) =>
        names
          .filter((name) => name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1)
          .map((name) => name.textContent?.trim())
      );
    expect(cut).toEqual([]);
  });

  test('narrows to what takes in an area from the list of reaches, goes to a family by a tap and opens the menu of a row', async ({
    page,
  }) => {
    const panel = await openEffectLibrary(page);

    await panel.getByTestId('effect-library-reach-select').selectOption({ index: 3 });
    const fire = panel.locator('[data-family-entry][data-family="炎"]');
    await expect(fire).toContainText('2');
    await expect(panel.locator('[data-effect-reach]').first()).toContainText('範囲');

    await panel.getByTestId('effect-library-reach-select').selectOption({ index: 0 });
    const ice = panel.locator('[data-family-entry][data-family="氷"]');
    await ice.tap();
    await expect(ice).toHaveAttribute('aria-current', 'true');
    await expect
      .poll(() =>
        panel.getByTestId('effect-library-rows').evaluate((list) => {
          const heading = list.querySelector('[data-family-section="氷"] [data-family-heading]')!;
          return Math.abs(heading.getBoundingClientRect().top - list.getBoundingClientRect().top);
        })
      )
      .toBeLessThan(1.5);

    await panel.locator('[data-family-section="氷"] [data-effect-more]').first().tap();
    await expect(page.locator('[data-context-menu-root]').first()).toContainText('チャット記法');
  });
});
