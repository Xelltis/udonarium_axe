import { test } from '@playwright/test';

import { drawSampleModels } from '../helpers';
import { closePanels, prepare, snap } from './fixtures';

test('the pieces face the camera after it is turned from the keyboard', async ({ page }) => {
  await drawSampleModels(page);
  await prepare(page);
  await closePanels(page);
  await page.locator('body').click({ position: { x: 1200, y: 780 } });
  for (let step = 0; step < 12; step++) await page.keyboard.press('Shift+ArrowRight');
  for (let step = 0; step < 4; step++) await page.keyboard.press('Shift+ArrowUp');
  await snap(page, 'camera-rotated');
});
