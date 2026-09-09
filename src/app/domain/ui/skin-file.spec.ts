import { readSkinFile, SKIN_FILE_MARKER, skinFileName, writeSkinFile } from '@axe/domain/ui/skin-file';
import { SkinLayer } from '@axe/domain/ui/skin-layer';
import { SkinRecipe } from '@axe/domain/ui/skin-palette';

const RECIPE: SkinRecipe = { hue: 200, chroma: 18, accentHue: 40, accentChroma: 50, lift: 4, spread: -6 };
const LAYER: SkinLayer = { id: 'a', name: 'paper.webp', opacity: 60, fit: 'tile', anchor: 'top-left' };

describe('writing a skin out to a file', () => {
  it('reads back everything it wrote', () => {
    const written = writeSkinFile(RECIPE, 'dark', '夜の卓', [{ layer: LAYER, entry: '1-a.webp' }]);
    const read = readSkinFile(written);

    expect(read?.kind).toBe(SKIN_FILE_MARKER);
    expect(read?.name).toBe('夜の卓');
    expect(read?.mode).toBe('dark');
    expect(read?.recipe.hue).toBe(200);
    expect(read?.recipe.spread).toBe(-6);
    expect(read?.layers).toEqual([
      { file: '1-a.webp', name: 'paper.webp', opacity: 60, fit: 'tile', anchor: 'top-left' },
    ]);
  });

  it('carries the stack in the order it was drawn in', () => {
    const written = writeSkinFile(RECIPE, 'light', 'a', [
      { layer: { ...LAYER, id: 'x', name: 'under' }, entry: '1-x.webp' },
      { layer: { ...LAYER, id: 'y', name: 'over' }, entry: '2-y.webp' },
    ]);

    expect(readSkinFile(written)?.layers.map((entry) => entry.name)).toEqual(['under', 'over']);
  });

  it('says nothing about pictures when there are none', () => {
    expect(readSkinFile(writeSkinFile(RECIPE, 'light', 'a', []))?.layers).toEqual([]);
  });
});

describe('reading a skin someone was handed', () => {
  it('turns away a file that never said it was a skin', () => {
    expect(readSkinFile('{"hue":200}')).toBeNull();
    expect(readSkinFile(JSON.stringify({ kind: 'something-else', recipe: RECIPE }))).toBeNull();
  });

  it('turns away anything that is not a file at all', () => {
    expect(readSkinFile('')).toBeNull();
    expect(readSkinFile('{ broken')).toBeNull();
    expect(readSkinFile('[]')).toBeNull();
  });

  it('pulls a recipe from elsewhere into the range the sliders offer', () => {
    const wild = JSON.stringify({
      kind: SKIN_FILE_MARKER,
      version: 1,
      name: 'x',
      mode: 'light',
      recipe: { hue: 900, chroma: 900, accentHue: -40, accentChroma: 900, spread: 900 },
    });

    const read = readSkinFile(wild);

    expect(read?.recipe.chroma).toBeLessThanOrEqual(40);
    expect(read?.recipe.accentChroma).toBeLessThanOrEqual(80);
    expect(read?.recipe.hue).toBeLessThan(360);
  });

  it('drops a layer that names no picture', () => {
    const half = JSON.stringify({
      kind: SKIN_FILE_MARKER,
      mode: 'light',
      recipe: RECIPE,
      layers: [{ opacity: 50 }, { file: 'ok.webp', opacity: 50 }, 'nonsense'],
    });

    expect(readSkinFile(half)?.layers.map((entry) => entry.file)).toEqual(['ok.webp']);
  });

  it('pulls a layer from elsewhere into range too', () => {
    const wild = JSON.stringify({
      kind: SKIN_FILE_MARKER,
      mode: 'light',
      recipe: RECIPE,
      layers: [{ file: 'a.webp', opacity: 900, fit: 'sideways', anchor: 'nowhere' }],
    });

    expect(readSkinFile(wild)?.layers[0]).toEqual({
      file: 'a.webp',
      name: '',
      opacity: 100,
      fit: 'cover',
      anchor: 'center',
    });
  });

  it('reads a ladder it does not know as the light one', () => {
    const odd = JSON.stringify({ kind: SKIN_FILE_MARKER, mode: 'sideways', recipe: RECIPE });

    expect(readSkinFile(odd)?.mode).toBe('light');
  });
});

describe('what the file is called', () => {
  it('keeps the name it was given', () => {
    expect(skinFileName('夜の卓')).toBe('夜の卓.axe-skin.zip');
  });

  it('drops what a file system would refuse', () => {
    expect(skinFileName('a/b:c*d?')).toBe('abcd.axe-skin.zip');
  });

  it('falls back where nothing usable is left', () => {
    expect(skinFileName('   ')).toBe('skin.axe-skin.zip');
    expect(skinFileName('///')).toBe('skin.axe-skin.zip');
  });
});
