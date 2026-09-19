import { buildTablePhotoLayout, type TablePhotoMember } from '@axe/domain/replay/table-photo';
import type { ReplayFrameAssets, ReplayFrameCanvas, ReplayFrameImage } from '@axe/infrastructure/replay/replay-canvas';
import { paintTablePhoto } from '@axe/infrastructure/replay/table-photo-painter';

interface DrawnImage {
  image: ReplayFrameImage;
  x: number;
  y: number;
  width: number;
  height: number;
}

function recorder(): {
  ctx: ReplayFrameCanvas;
  texts: { text: string; x: number; y: number }[];
  images: DrawnImage[];
  fills: { x: number; y: number; width: number; height: number; color: string }[];
  counts: () => { saves: number; restores: number; clips: number };
} {
  let saves = 0;
  let restores = 0;
  let clips = 0;
  const texts: { text: string; x: number; y: number }[] = [];
  const images: DrawnImage[] = [];
  const fills: { x: number; y: number; width: number; height: number; color: string }[] = [];

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {
      saves++;
    },
    restore() {
      restores++;
    },
    clip() {
      clips++;
    },
    roundRect() {},
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ x, y, width, height, color: String(ctx.fillStyle) });
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y });
    },
    measureText(text: string) {
      return { width: [...text].length * 20 };
    },
    drawImage(image: ReplayFrameImage, x: number, y: number, width: number, height: number) {
      images.push({ image, x, y, width, height });
    },
  } as unknown as ReplayFrameCanvas;

  return { ctx, texts, images, fills, counts: () => ({ saves, restores, clips }) };
}

function member(name: string, imageIdentifier = ''): TablePhotoMember {
  return { identifier: name, name, imageIdentifier };
}

const assets: ReplayFrameAssets = {
  imageOf: (identifier) => (identifier.length > 0 ? ({ width: 400, height: 800 } as ReplayFrameImage) : null),
};

describe('paintTablePhoto()', () => {
  it('burns in the room name and the date', () => {
    const { ctx, texts } = recorder();
    const layout = buildTablePhotoLayout([member('アリス', 'a')]);

    paintTablePhoto(ctx, layout, assets, '洞窟の夜', '2026-08-12', undefined);

    expect(texts.map((entry) => entry.text)).toContain('洞窟の夜');
    expect(texts.map((entry) => entry.text)).toContain('2026-08-12');
  });

  it('draws the name of each piece in its own frame', () => {
    const { ctx, texts } = recorder();
    const layout = buildTablePhotoLayout([member('アリス', 'a'), member('ボブ', 'b')]);

    paintTablePhoto(ctx, layout, assets, '卓', '', undefined);

    expect(texts.map((entry) => entry.text)).toEqual(expect.arrayContaining(['アリス', 'ボブ']));
  });

  it('fits a portrait into its frame without cropping', () => {
    const { ctx, images } = recorder();
    const layout = buildTablePhotoLayout([member('アリス', 'a')]);

    paintTablePhoto(ctx, layout, assets, '卓', '', undefined);

    const cell = layout.cells[0];
    const drawn = images[0];
    expect(drawn.width / drawn.height).toBeCloseTo(400 / 800, 1);
    expect(drawn.x).toBeGreaterThanOrEqual(cell.x);
    expect(drawn.x + drawn.width).toBeLessThanOrEqual(cell.x + cell.width);
    expect(drawn.y + drawn.height).toBeLessThanOrEqual(cell.y + cell.height);
  });

  it('keeps the frame and the name for a piece with no picture', () => {
    const { ctx, texts, images } = recorder();
    const layout = buildTablePhotoLayout([member('名無し')]);

    paintTablePhoto(ctx, layout, assets, '卓', '', undefined);

    expect(images).toHaveLength(0);
    expect(texts.map((entry) => entry.text)).toContain('名無し');
  });

  it('lets nothing spill outside its frame', () => {
    const { ctx, counts } = recorder();
    const layout = buildTablePhotoLayout([member('アリス', 'a'), member('ボブ', 'b')]);

    paintTablePhoto(ctx, layout, assets, '卓', '', undefined);

    // The name plate stays inside the rounded frame, and every clip is restored.
    expect(counts().clips).toBe(layout.cells.length);
    expect(counts().saves).toBe(counts().restores);
  });

  it('cuts a long name short rather than squashing it', () => {
    const { ctx, texts } = recorder();
    const layout = buildTablePhotoLayout(Array.from({ length: 12 }, (_, i) => member(`とても長い名前のコマ${i}`, 'a')));

    const longName = 'とても長い部屋の名前がここに入ります'.repeat(8);
    paintTablePhoto(ctx, layout, assets, longName, '2026-08-12', undefined);

    const title = texts[0].text;
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThan(longName.length);
  });

  it('centres a portrait between the top and bottom of its frame', () => {
    const { ctx, images } = recorder();
    const layout = buildTablePhotoLayout([member('アリス', 'a')]);

    paintTablePhoto(ctx, layout, assets, '卓', '', undefined);

    const cell = layout.cells[0];
    const drawn = images[0];
    const top = drawn.y - cell.y;
    const bottom = cell.y + cell.height - layout.name.height - (drawn.y + drawn.height);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(2);
  });

  it('paints the whole sheet before laying anything out', () => {
    const { ctx, fills } = recorder();
    const layout = buildTablePhotoLayout([member('アリス', 'a')]);

    paintTablePhoto(ctx, layout, assets, '卓', '', undefined);

    expect(fills[0]).toMatchObject({ x: 0, y: 0, width: layout.width, height: layout.height });
  });
});
