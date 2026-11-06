import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

/**
 * The page as a whole, which never scrolls: a panel laid out reaching past the bottom of the screen
 * is cut off there, and nothing that asks the boxes round it to scroll, as a text editor does to
 * bring its caret into view, moves the page up under the bars held to the screen.
 */
test('the page never scrolls as a whole, however far what is laid on it reaches past the screen', async ({ page }) => {
  await waitAppReady(page);

  const scrolled = await page.evaluate(() => {
    const tall = document.createElement('div');
    tall.style.cssText = 'position: absolute; left: 0; top: 0; width: 10px; height: 3000px;';
    document.body.appendChild(tall);
    document.body.scrollTop = 500;
    document.documentElement.scrollTop = 500;
    const caret = document.createElement('div');
    caret.style.cssText = 'position: absolute; left: 0; top: 2900px; width: 10px; height: 10px;';
    document.body.appendChild(caret);
    caret.scrollIntoView();
    return { body: document.body.scrollTop, page: document.documentElement.scrollTop };
  });

  expect(scrolled).toEqual({ body: 0, page: 0 });
});
