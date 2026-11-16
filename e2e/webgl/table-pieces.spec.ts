import { expect, Page, test } from '@playwright/test';

import { closePanels, createCharacter, createCoin, createDiceSymbol, idleOnCanvas, waitAppReady } from '../helpers';
import {
  createDeck,
  createMask,
  createNote,
  createRange,
  drawCard,
  idsOf,
  made as madePiece,
  madeSince,
  takeAway,
} from '../piece-helpers';

/**
 * Pieces drawn on the canvas. The page still lays each piece out, clear, to take its presses, and
 * picking finds it by the shapes the scene is built from, so the canvas has to draw a piece exactly
 * where picking finds it: what making a piece changes on the screen is held against where picking
 * says the piece is. Where the page lays a piece out, its menu and its drags are held in
 * e2e/canvas-picking.spec.ts, with nothing drawn.
 */

/** How near an edge of a piece's box a point may lie and be left out, in pixels. */
const EDGE_SLACK_PX = 3;
const STEP_PX = 3;

/** A picture of the screen, read into the page so its colours can be looked up there, beside the one taken before it. */
async function grabScreen(page: Page): Promise<void> {
  const shot = await page.screenshot({ scale: 'css' });
  await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const kept = (window as unknown as { __shots?: ImageData[] }).__shots ?? [];
    (window as unknown as { __shots: ImageData[] }).__shots = [
      ...kept.slice(-1),
      canvas.getContext('2d')!.getImageData(0, 0, image.width, image.height),
    ];
  }, shot.toString('base64'));
}

/**
 * The kinds of piece drawn on the canvas: what is set out before one is made, how it is made, how
 * many shapes it is drawn with, and how it is taken off the table again, with what was set out for it.
 * A light is left out, as it changes the table round it as well as where it is drawn.
 */
const PIECES: readonly {
  name: string;
  tag: string;
  prepare?: (page: Page) => Promise<void>;
  create: (page: Page) => Promise<void>;
  shapes: number;
  takenAwayBy: string;
  leavesBehind?: { tag: string; takenAwayBy: string };
}[] = [
  { name: 'die', tag: 'dice-symbol', create: createDiceSymbol, shapes: 2, takenAwayBy: '削除する' },
  { name: 'coin', tag: 'coin', create: createCoin, shapes: 1, takenAwayBy: '削除する' },
  {
    name: 'card',
    tag: 'card',
    prepare: createDeck,
    create: drawCard,
    shapes: 1,
    takenAwayBy: '削除する',
    leavesBehind: { tag: 'card-stack', takenAwayBy: '山札を削除する' },
  },
  // A deck stands in 30 layers under its plate and its top card.
  { name: 'deck', tag: 'card-stack', create: createDeck, shapes: 32, takenAwayBy: '山札を削除する' },
  // A note is made standing up, picked by its panel and by its back.
  { name: 'note', tag: 'text-note', create: createNote, shapes: 2, takenAwayBy: '削除する' },
  { name: 'mask', tag: 'game-table-mask', create: createMask, shapes: 1, takenAwayBy: '削除する' },
  { name: 'range', tag: 'range', create: createRange, shapes: 1, takenAwayBy: '削除する' },
  { name: 'character', tag: 'game-character', create: createCharacter, shapes: 1, takenAwayBy: '墓場に移動' },
];

/** Makes a piece and waits until the canvas draws it and its animations are over, and answers its identifier. */
function made(page: Page, piece: (typeof PIECES)[number]): Promise<string> {
  return madePiece(page, piece, idleOnCanvas);
}

/**
 * What changed between the last two pictures of the screen round a piece, at points where picking
 * finds the piece and at points where it finds something else or nothing, leaving out points on the
 * very edge of a shape and points the page draws a part of a piece over.
 */
function changesRound(page: Page, identifier: string) {
  return page.evaluate(
    ({ identifier, slack, step }) => {
      const hooks = window.__axeTable;
      const [before, after] = (window as unknown as { __shots: ImageData[] }).__shots.slice(-2);
      const boxes = hooks.pieceBoxesOnPage(identifier);
      const left = Math.min(...boxes.map((box) => box.x)) - 40;
      const top = Math.min(...boxes.map((box) => box.y)) - 40;
      const right = Math.max(...boxes.map((box) => box.x + box.width)) + 40;
      const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 40;
      const edges = hooks.edgesOnPage();
      const nearEdge = (x: number, y: number) =>
        edges.some(([x1, y1, x2, y2]) => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const along = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(x - (x1 + along * dx), y - (y1 + along * dy)) < slack;
        });
      const changed = (x: number, y: number) => {
        const at = (y * before.width + x) * 4;
        return Math.max(...[0, 1, 2].map((c) => Math.abs(before.data[at + c] - after.data[at + c]))) > 6;
      };
      const tellsOfPiece = (element: Element | null) => {
        const owner = element?.closest('[data-object-id]');
        if (!owner) return true;
        if (owner.getAttribute('data-object-id') !== identifier) return false;
        if (element!.closest('[data-testid="table-hud"]') && element!.matches('[data-part], [data-hud-box]')) {
          return true;
        }
        for (let at: Element | null = element; at && at !== owner.parentElement; at = at.parentElement) {
          if (getComputedStyle(at).opacity === '0') return true;
        }
        return false;
      };
      const result = { piece: 0, pieceChanged: 0, bare: 0, bareChanged: 0 };
      for (let y = Math.max(0, Math.round(top)); y < Math.min(innerHeight, bottom); y += step) {
        for (let x = Math.max(0, Math.round(left)); x < Math.min(innerWidth, right); x += step) {
          if (nearEdge(x, y) || !tellsOfPiece(document.elementFromPoint(x, y))) continue;
          if (hooks.pickAt(x, y) === identifier) {
            result.piece++;
            if (changed(x, y)) result.pieceChanged++;
          } else {
            result.bare++;
            if (changed(x, y)) result.bareChanged++;
          }
        }
      }
      return result;
    },
    { identifier, slack: EDGE_SLACK_PX, step: STEP_PX }
  );
}

test.describe('pieces drawn on a canvas', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
    await closePanels(page);
  });

  test('draw each kind of piece where picking finds it, and nothing anywhere else', async ({ page }) => {
    test.setTimeout(240_000);
    for (const piece of PIECES) {
      const setOut = piece.leavesBehind ? await idsOf(page, piece.leavesBehind.tag) : [];
      await piece.prepare?.(page);
      const left = piece.leavesBehind ? await madeSince(page, piece.leavesBehind.tag, setOut) : null;
      await idleOnCanvas(page);
      await grabScreen(page);
      const id = await made(page, piece);
      await grabScreen(page);

      const changes = await changesRound(page, id);

      expect(changes.pieceChanged, `${piece.name}: ${JSON.stringify(changes)}`).toBeGreaterThan(changes.piece * 0.2);
      expect(changes.bareChanged / changes.bare, `${piece.name}: ${JSON.stringify(changes)}`).toBeLessThan(0.01);
      await takeAway(page, piece.tag, id, piece.takenAwayBy);
      if (left) await takeAway(page, piece.leavesBehind!.tag, left, piece.leavesBehind!.takenAwayBy);
    }
  });
});
