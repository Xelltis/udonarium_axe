import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { pictureForCanvas } from '@axe/ui/tabletop/picture-for-canvas';
import type { MockInstance } from 'vitest';

describe('pictureForCanvas()', () => {
  let pictures: PiecePicturesService;
  let show: MockInstance<PiecePicturesService['show']>;
  let forget: MockInstance<PiecePicturesService['forget']>;
  let whileTaking: MockInstance<PiecePicturesService['whileTaking']>;
  const identifier = signal('note');
  const pictured = signal(true);
  const element = signal<HTMLElement | undefined>(undefined);
  const look = signal(0);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    pictures = TestBed.inject(PiecePicturesService);
    show = vi.spyOn(pictures, 'show');
    forget = vi.spyOn(pictures, 'forget');
    whileTaking = vi.spyOn(pictures, 'whileTaking').mockResolvedValue(new Blob(['png']) as never);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture');
    identifier.set('note');
    pictured.set(true);
    element.set(document.createElement('div'));
    look.set(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(extra: { region?: boolean; pickAreas?: boolean; paper?: string } = {}): Promise<void> {
    TestBed.runInInjectionContext(() =>
      pictureForCanvas({
        identifier: () => identifier(),
        element: () => element(),
        pictured: () => pictured(),
        follows: () => look(),
        region: extra.region ? () => ({ left: 5, top: 7, width: 40, height: 30 }) : undefined,
        paper:
          extra.paper === undefined
            ? undefined
            : (part) => (part === element() && extra.paper ? { colour: extra.paper, opacity: 0.9 } : null),
        pickAreas: extra.pickAreas
          ? () => [
              [
                { x: 5, y: 7 },
                { x: 45, y: 7 },
                { x: 45, y: 37 },
              ],
            ]
          : undefined,
      })
    );
    await settle();
  }

  async function settle(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('hands the canvas a picture of the part once it is laid out, sized and placed as the region says', async () => {
    await setup({ region: true, pickAreas: true });

    expect(whileTaking).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith('note', {
      url: 'blob:picture',
      widthPx: 40,
      heightPx: 30,
      offsetX: 5,
      offsetY: 7,
      pickAreas: [
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 30 },
        ],
      ],
    });
  });

  it('hands over the paper the part is painted on with its picture, read off the part, and none where there is none', async () => {
    await setup({ region: true, paper: '#161b22' });

    expect(show.mock.calls[0][1].paper).toEqual({ colour: '#161b22', opacity: 0.9 });
  });

  it('hands over no paper for a part that tells none', async () => {
    await setup({ region: true, paper: '' });
    await setup({ region: true });

    expect(show.mock.calls.map(([, picture]) => 'paper' in picture)).toEqual([false, false]);
  });

  it('takes the picture again when what the part looks like changes', async () => {
    await setup({ region: true });

    look.set(1);
    await settle();

    expect(whileTaking).toHaveBeenCalledTimes(2);
  });

  it('takes the picture back while the piece is not to be pictured, and takes none meanwhile', async () => {
    await setup({ region: true });

    pictured.set(false);
    await settle();

    expect(forget).toHaveBeenCalledWith('note');
    expect(whileTaking).toHaveBeenCalledTimes(1);
  });

  it('takes none while the page has not laid the part out', async () => {
    element.set(undefined);
    await setup({ region: true });

    expect(whileTaking).not.toHaveBeenCalled();
  });

  it('takes the picture back once the part is gone', async () => {
    await setup({ region: true });

    TestBed.resetTestingModule();

    expect(forget).toHaveBeenCalledWith('note');
  });
});
