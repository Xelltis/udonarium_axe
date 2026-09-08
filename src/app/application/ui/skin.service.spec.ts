import { readFileSync } from 'node:fs';

import { TestBed } from '@angular/core/testing';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { SkinImageStore } from '@axe/core/storage/skin-image-store';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';
import { chatBubbleBaseTone, resetChatBubbleBaseTone } from '@axe/domain/ui/chat-bubble-base';
import { CUSTOM_SKIN, STANDARD_SKIN } from '@axe/domain/ui/skin';
import { readSkinFile, SKIN_FILE_NAME } from '@axe/domain/ui/skin-file';
import { MAX_LAYERS, SkinLayer } from '@axe/domain/ui/skin-layer';

/** The first bytes of a PNG, so what the guard sniffs is what a picture actually starts with. */
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function picture(): Blob {
  return new Blob([PNG_HEAD], { type: 'image/png' });
}

const KEYS = [
  'ui-theme',
  'ui-skin-light',
  'ui-skin-dark',
  'ui-skin-recipe-light',
  'ui-skin-recipe-dark',
  'ui-skin-layers-light',
  'ui-skin-layers-dark',
];

function painted(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

describe('SkinService', () => {
  function setup(): { skins: SkinService; theme: ThemeService } {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          media: query,
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList
    );
    TestBed.configureTestingModule({ providers: [ThemeService, SkinService] });
    const theme = TestBed.inject(ThemeService);
    const skins = TestBed.inject(SkinService);
    TestBed.tick();
    return { skins, theme };
  }

  beforeEach(() => {
    for (const key of KEYS) localStorage.removeItem(key);
    document.documentElement.removeAttribute('style');
    AttachedDocuments.reset(document);
    resetChatBubbleBaseTone();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    document.documentElement.removeAttribute('style');
    resetChatBubbleBaseTone();
  });

  it('paints nothing until a skin is chosen', () => {
    const { skins } = setup();

    expect(skins.current()).toBe(STANDARD_SKIN);
    expect(painted('--ui-bg')).toBe('');
  });

  it('paints the colours of the skin it is given', () => {
    const { skins } = setup();

    skins.choose('parchment');
    TestBed.tick();

    expect(skins.current()).toBe('parchment');
    expect(painted('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
    expect(painted('--ui-accent')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('takes the colours back off when the standard one is chosen again', () => {
    const { skins } = setup();

    skins.choose('parchment');
    TestBed.tick();
    skins.choose(STANDARD_SKIN);
    TestBed.tick();

    expect(painted('--ui-bg')).toBe('');
    expect(painted('--ui-accent')).toBe('');
  });

  it('remembers the choice for each ladder on its own', () => {
    const { skins, theme } = setup();

    skins.choose('parchment', 'light');
    skins.choose('deepSea', 'dark');
    TestBed.tick();

    expect(localStorage.getItem('ui-skin-light')).toBe('parchment');
    expect(localStorage.getItem('ui-skin-dark')).toBe('deepSea');

    theme.theme.set('dark');
    TestBed.tick();

    expect(skins.current()).toBe('deepSea');
  });

  it('repaints when the light and dark switch moves', () => {
    const { skins, theme } = setup();

    skins.choose('parchment', 'light');
    skins.choose('deepSea', 'dark');
    theme.theme.set('light');
    TestBed.tick();
    const onLight = painted('--ui-bg');

    theme.theme.set('dark');
    TestBed.tick();

    expect(painted('--ui-bg')).not.toBe(onLight);
  });

  it('reads a skin this build no longer has as the standard one', () => {
    localStorage.setItem('ui-skin-light', 'a-skin-from-2029');
    const { skins } = setup();

    expect(skins.current()).toBe(STANDARD_SKIN);
    expect(painted('--ui-bg')).toBe('');
  });

  it('keeps the numbers of a skin a person built, and switches to it', () => {
    const { skins } = setup();

    skins.build({ hue: 200, chroma: 20, accentHue: 40, accentChroma: 50 });
    TestBed.tick();

    expect(skins.current()).toBe(CUSTOM_SKIN);
    expect(JSON.parse(localStorage.getItem('ui-skin-recipe-light')!).hue).toBe(200);
    expect(painted('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('reads back the skin a person built the next time the app opens', () => {
    localStorage.setItem('ui-skin-light', CUSTOM_SKIN);
    localStorage.setItem(
      'ui-skin-recipe-light',
      JSON.stringify({ hue: 300, chroma: 18, accentHue: 90, accentChroma: 40 })
    );
    const { skins } = setup();

    expect(skins.current()).toBe(CUSTOM_SKIN);
    expect(skins.recipe().hue).toBe(300);
  });

  it('survives a recipe that is not a recipe', () => {
    localStorage.setItem('ui-skin-light', CUSTOM_SKIN);
    localStorage.setItem('ui-skin-recipe-light', 'not json at all');
    const { skins } = setup();

    expect(() => TestBed.tick()).not.toThrow();
    expect(skins.current()).toBe(CUSTOM_SKIN);
    expect(painted('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('moves the tone the chat bubbles are worked out against, and puts it back', () => {
    const { skins } = setup();
    const standard = chatBubbleBaseTone('light');

    skins.build({ hue: 82, chroma: 14, accentHue: 160, accentChroma: 30, lift: 10 });
    TestBed.tick();
    expect(chatBubbleBaseTone('light')).toBeGreaterThan(standard);

    skins.choose(STANDARD_SKIN);
    TestBed.tick();
    expect(chatBubbleBaseTone('light')).toBe(standard);
  });

  it('is reached at startup, so a seat is dressed on load without a panel being opened', () => {
    // Nothing else asks for this service until the picker is created, and a skin that only
    // arrives once someone opens a panel is a skin that is gone after every reload.
    const root = readFileSync('src/app/app.component.ts', 'utf-8');

    expect(root).toContain('inject(SkinService)');
  });

  it('dresses the seat as soon as it is created, with no panel in sight', () => {
    localStorage.setItem('ui-skin-light', 'parchment');
    setup();

    expect(painted('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('papers nothing until a picture is given', () => {
    const { skins } = setup();

    expect(skins.stack()).toEqual([]);
    expect(skins.panelLayers()).toEqual([]);
  });

  it('takes a picture into the stack and hands it out as a style', async () => {
    const kept: Record<string, Blob> = {};
    vi.spyOn(SkinImageStore.instance, 'put').mockImplementation(async (id, blob) => {
      kept[id] = blob;
      return true;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper');
    const { skins } = setup();

    const done = await skins.addLayer(picture(), 'paper.png');

    expect(done).toBe(true);
    expect(skins.stack().length).toBe(1);
    expect(skins.stack()[0].name).toBe('paper.png');
    expect(Object.keys(kept).length).toBe(1);
    expect(skins.panelLayers()[0].backgroundImage).toBe('url("blob:paper")');
    expect(skins.panelLayers()[0].opacity).toBe(1);
  });

  it('turns away a file that is not a picture', async () => {
    const { skins } = setup();

    expect(await skins.addLayer(new Blob(['{}'], { type: 'application/json' }), 'x.json')).toBe(false);
    expect(skins.stack()).toEqual([]);
  });

  it('takes a picture back out of the stack', async () => {
    vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(SkinImageStore.instance, 'remove').mockResolvedValue();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { skins } = setup();
    await skins.addLayer(picture(), 'paper.png');

    await skins.removeLayer(skins.stack()[0].id);

    expect(skins.stack()).toEqual([]);
    expect(skins.panelLayers()).toEqual([]);
  });

  it('changes one layer without disturbing the rest', async () => {
    vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper');
    const { skins } = setup();
    await skins.addLayer(picture(), 'a.png');
    await skins.addLayer(picture(), 'b.png');
    const [under] = skins.stack();

    skins.tuneLayer(under.id, { opacity: 30, fit: 'tile', anchor: 'top-left' });

    expect(skins.stack()[0]).toMatchObject({ opacity: 30, fit: 'tile', anchor: 'top-left' });
    expect(skins.stack()[1].opacity).toBe(100);
    expect(skins.panelLayers()[0].backgroundRepeat).toBe('repeat');
    expect(skins.panelLayers()[0].opacity).toBe(0.3);
  });

  it('moves a layer through the stack and remembers where it landed', async () => {
    vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper');
    const { skins } = setup();
    await skins.addLayer(picture(), 'a.png');
    await skins.addLayer(picture(), 'b.png');

    skins.moveLayer(skins.stack()[0].id, 1);

    expect(skins.stack().map((layer) => layer.name)).toEqual(['b.png', 'a.png']);
    expect(JSON.parse(localStorage.getItem('ui-skin-layers-light')!).map((l: SkinLayer) => l.name)).toEqual([
      'b.png',
      'a.png',
    ]);
  });

  it('stops taking pictures once the stack is full', async () => {
    vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper');
    const { skins } = setup();
    for (let i = 0; i < MAX_LAYERS; i++) {
      await skins.addLayer(picture(), `${i}.png`);
    }

    expect(skins.stackIsFull()).toBe(true);
    expect(await skins.addLayer(picture(), 'x.png')).toBe(false);
    expect(skins.stack().length).toBe(MAX_LAYERS);
  });

  it('leaves out a layer whose bytes have gone', () => {
    localStorage.setItem(
      'ui-skin-layers-light',
      JSON.stringify([{ id: 'lost', name: 'gone.png', opacity: 100, fit: 'cover', anchor: 'center' }])
    );
    const { skins } = setup();

    expect(skins.stack().length).toBe(1);
    expect(skins.panelLayers()).toEqual([]);
  });

  it('writes a skin out as a zip that reads back as the same skin', async () => {
    vi.spyOn(SkinImageStore.instance, 'get').mockResolvedValue(null);
    const saved: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      saved.push(blob as Blob);
      return 'blob:skin';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { skins } = setup();
    skins.build({ hue: 210, chroma: 22, accentHue: 40, accentChroma: 55 });

    await skins.exportSkin('夜の卓');

    expect(saved.length).toBeGreaterThan(0);
    const { readZipEntries } = await import('@axe/core/storage/zip-archive');
    const entries = await readZipEntries(saved[saved.length - 1]);
    const description = entries.find((entry) => entry.name === SKIN_FILE_NAME);
    const read = readSkinFile(await description!.blob.text());

    expect(read?.name).toBe('夜の卓');
    expect(read?.recipe.hue).toBe(210);
  });

  it('wears a skin read out of a zip, pictures and all', async () => {
    vi.spyOn(SkinImageStore.instance, 'get').mockResolvedValue(null);
    vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(SkinImageStore.instance, 'remove').mockResolvedValue();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:skin');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { skins } = setup();

    const { createZipBlob } = await import('@axe/core/storage/zip-archive');
    const text = JSON.stringify({
      kind: 'udonarium-axe-skin',
      version: 1,
      name: 'から',
      mode: 'light',
      recipe: { hue: 111, chroma: 15, accentHue: 20, accentChroma: 40 },
      layers: [{ file: '1-a.webp', name: 'paper', opacity: 40, fit: 'tile', anchor: 'top-left' }],
    });
    const zipped = await createZipBlob([
      new File([text], SKIN_FILE_NAME, { type: 'application/json' }),
      new File([PNG_HEAD], '1-a.webp', { type: 'image/webp' }),
    ]);

    expect(await skins.importSkin(zipped)).toBe(true);
    expect(skins.skinOf('light')).toBe(CUSTOM_SKIN);
    expect(skins.recipeOf('light').hue).toBe(111);
    expect(skins.stack().length).toBe(1);
    expect(skins.stack()[0]).toMatchObject({ name: 'paper', opacity: 40, fit: 'tile' });
  });

  it('holds a zip to the same guards a file picker goes through', async () => {
    const put = vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(SkinImageStore.instance, 'get').mockResolvedValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:skin');
    const { skins } = setup();

    const { createZipBlob } = await import('@axe/core/storage/zip-archive');
    const text = JSON.stringify({
      kind: 'udonarium-axe-skin',
      mode: 'light',
      recipe: { hue: 100, chroma: 10, accentHue: 20, accentChroma: 40 },
      layers: [{ file: 'a.txt', name: 'not a picture', opacity: 100, fit: 'cover', anchor: 'center' }],
    });
    const zipped = await createZipBlob([
      new File([text], SKIN_FILE_NAME, { type: 'application/json' }),
      new File([new Blob(['plain text'])], 'a.txt', { type: 'text/plain' }),
    ]);

    expect(await skins.importSkin(zipped)).toBe(true);
    expect(skins.stack()).toEqual([]);
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps a removed picture until the way back has been passed up', async () => {
    const removed = vi.spyOn(SkinImageStore.instance, 'remove').mockResolvedValue();
    vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper');
    const { skins } = setup();
    await skins.addLayer(picture(), 'a.png');
    const worn = skins.snapshot();

    skins.removeLayer(skins.stack()[0].id);
    expect(skins.stack()).toEqual([]);
    expect(removed).not.toHaveBeenCalled();

    skins.restore(worn);

    expect(skins.stack().length).toBe(1);
    expect(skins.panelLayers().length).toBe(1);
  });

  it('leaves the seat alone when the zip is not a skin', async () => {
    const { createZipBlob } = await import('@axe/core/storage/zip-archive');
    const { skins } = setup();
    const zipped = await createZipBlob([new File(['nope'], 'readme.txt', { type: 'text/plain' })]);

    expect(await skins.importSkin(zipped)).toBe(false);
    expect(skins.skinOf('light')).toBe(STANDARD_SKIN);
  });

  it('hands the picker the colours a skin would paint without painting them', () => {
    const { skins } = setup();

    expect(skins.preview('parchment', 'light')?.['--ui-bg']).toMatch(/^#[0-9a-f]{6}$/);
    expect(skins.preview(STANDARD_SKIN, 'light')).toBeNull();
    expect(painted('--ui-bg')).toBe('');
  });
});
