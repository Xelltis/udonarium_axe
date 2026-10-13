import { expect, Locator, Page } from '@playwright/test';

export type Point = { x: number; y: number };

export function piece(page: Page, name: string): Locator {
  return page.locator('game-character').filter({ has: page.getByTestId('piece-name').getByText(name) });
}

/**
 * A piece found by its name now, and kept hold of by a mark put on its element. A piece riding another
 * shows its name in the mount's riding label rather than over itself, so a piece about to get on one
 * is pinned before it does; the pieces may be drawn in another order once one has moved.
 */
export async function pinnedPiece(page: Page, name: string): Promise<Locator> {
  const marked = await page.locator('game-character').evaluateAll((elements, wanted) => {
    const found = elements.find((element) =>
      element.querySelector('[data-testid="piece-name"]')?.textContent?.includes(wanted)
    );
    found?.setAttribute('data-e2e-pinned', wanted);
    return !!found;
  }, name);
  expect(marked).toBe(true);
  return page.locator(`game-character[data-e2e-pinned="${name}"]`);
}

export function pedestal(of: Locator): Locator {
  return of.getByTestId('multi-angle-piece-motion-source');
}

export async function centreOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Where a piece stands on the table, which a camera moved over the table leaves as it was. */
export async function placeOf(of: Locator): Promise<string> {
  return of
    .locator(':scope > div')
    .first()
    .evaluate((element) => (element as HTMLElement).style.transform);
}

/** Waits for a piece to come to rest, as one just put down glides to its cell. */
export async function settle(of: Locator) {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await of.locator('img.image').boundingBox());
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [250] }
    )
    .toBe(true);
}

/**
 * Points on the front piece's picture, chosen by how opaque the front picture is there and by what
 * lies beneath it: the opacity of each picture under the point is read off the picture itself.
 */
export async function pointsOnPicture(
  page: Page,
  front: string,
  wanted: { frontAlpha: 'clear' | 'solid'; beneath: 'table' | string }
): Promise<Point[]> {
  return page.evaluate(
    ([frontName, frontAlpha, beneath]) => {
      const pieceOf = (name: string) =>
        [...document.querySelectorAll('game-character')].find((el) =>
          el.querySelector('[data-testid="piece-name"]')?.textContent?.includes(name)
        );
      const pictureOf = (el: Element | undefined) => el?.querySelector<HTMLImageElement>('img.image');
      const alphaAt = (picture: HTMLImageElement, x: number, y: number) => {
        let at = { x: -1, y: -1 };
        const listener = (event: Event) => {
          at = { x: (event as MouseEvent).offsetX, y: (event as MouseEvent).offsetY };
        };
        picture.addEventListener('probe', listener);
        picture.dispatchEvent(new MouseEvent('probe', { clientX: x, clientY: y }));
        picture.removeEventListener('probe', listener);
        const canvas = document.createElement('canvas');
        canvas.width = picture.naturalWidth;
        canvas.height = picture.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(picture, 0, 0);
        const px = Math.floor((at.x / picture.clientWidth) * picture.naturalWidth);
        const py = Math.floor((at.y / picture.clientHeight) * picture.naturalHeight);
        return context.getImageData(px, py, 1, 1).data[3];
      };
      const frontPiece = pieceOf(frontName)!;
      const picture = pictureOf(frontPiece)!;
      const box = picture.getBoundingClientRect();
      const found: { x: number; y: number }[] = [];
      for (let gy = 0.04; gy < 1; gy += 0.04) {
        for (let gx = 0.04; gx < 1; gx += 0.04) {
          const x = Math.round(box.left + box.width * gx);
          const y = Math.round(box.top + box.height * gy);
          const hits = document.elementsFromPoint(x, y);
          if (hits[0] !== picture) continue;
          const alpha = alphaAt(picture, x, y);
          if (frontAlpha === 'clear' ? alpha >= 26 : alpha < 250) continue;
          const under = hits.find((hit) => !frontPiece.contains(hit));
          if (beneath === 'table') {
            if (under?.closest('game-character')) continue;
          } else {
            const back = pictureOf(pieceOf(beneath));
            if (!back || under !== back || alphaAt(back, x, y) < 250) continue;
          }
          found.push({ x, y });
        }
      }
      return found;
    },
    [front, wanted.frontAlpha, wanted.beneath] as const
  );
}
