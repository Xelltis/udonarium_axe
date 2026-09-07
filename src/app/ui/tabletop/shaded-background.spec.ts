import {
  shadedBackgroundGrid,
  shadedBackgroundImage,
  shadeRgbOf,
  STRETCHED_TEXTURE,
} from '@axe/ui/tabletop/shaded-background';

describe('shadedBackgroundImage', () => {
  it('lays nothing over a texture that is already as bright as it gets', () => {
    expect(shadedBackgroundImage('a.png', 1)).toBe('url(a.png)');
  });

  it('lays black over it at what the brightness takes away', () => {
    expect(shadedBackgroundImage('a.png', 0.3)).toBe(
      'linear-gradient(rgba(0,0,0,0.700), rgba(0,0,0,0.700)), url(a.png)'
    );
  });

  it('rounds to a thousandth, so the same shade reads as the same string', () => {
    expect(shadedBackgroundImage('a.png', 0.123456)).toBe(shadedBackgroundImage('a.png', 0.1234561));
  });

  it('leaves a texture alone when the difference is too small to see', () => {
    expect(shadedBackgroundImage('a.png', 0.9999)).toBe('url(a.png)');
  });
});

describe('shadedBackgroundGrid', () => {
  it('lays the texture bare when every cell is fully lit', () => {
    const shaded = shadedBackgroundGrid('a.png', [1, 1, 1, 1], 2, 2);
    expect(shaded.image).toBe('url(a.png)');
    expect(shaded.style).toEqual({
      'background-size': '100% 100%',
      'background-position': '0 0',
      'background-repeat': 'no-repeat',
    });
  });

  it('lays one flat shade when every cell reads the same', () => {
    const shaded = shadedBackgroundGrid('a.png', [0.3, 0.3, 0.302], 3, 1);
    expect(shaded.image).toBe(shadedBackgroundImage('a.png', 0.3));
    expect(shaded.style['background-size']).toBe('100% 100%, 100% 100%');
  });

  it('runs one gradient across a single row, a stop in the middle of each cell', () => {
    const shaded = shadedBackgroundGrid('a.png', [1, 0.5], 2, 1);
    expect(shaded.image).toBe('linear-gradient(to right, rgba(0,0,0,0.000) 25%, rgba(0,0,0,0.500) 75%), url(a.png)');
    expect(shaded.style['background-size']).toBe('100% 100%, 100% 100%');
    expect(shaded.style['background-position']).toBe('0 0, 0 0');
  });

  it('lays a band for each row when there is more than one, top row first', () => {
    const shaded = shadedBackgroundGrid('a.png', [1, 1, 0, 0], 2, 2);
    expect(shaded.image).toBe(
      'linear-gradient(to right, rgba(0,0,0,0.000) 25%, rgba(0,0,0,0.000) 75%), ' +
        'linear-gradient(to right, rgba(0,0,0,1.000) 25%, rgba(0,0,0,1.000) 75%), url(a.png)'
    );
    expect(shaded.style['background-size']).toBe('100% 50%, 100% 50%, 100% 100%');
    expect(shaded.style['background-position']).toBe('0 0%, 0 100%, 0 0');
    expect(shaded.style['background-repeat']).toBe('no-repeat, no-repeat, no-repeat');
  });

  it('spaces three rows evenly down the face', () => {
    const shaded = shadedBackgroundGrid('a.png', [1, 0.5, 0], 1, 3);
    expect(shaded.style['background-size']).toBe('100% 33.3333%, 100% 33.3333%, 100% 33.3333%, 100% 100%');
    expect(shaded.style['background-position']).toBe('0 0%, 0 50%, 0 100%, 0 0');
  });

  it('keeps a tiled texture tiled under the shade', () => {
    const shaded = shadedBackgroundGrid('a.png', [1, 0.5], 2, 1, { size: '50px 50px', repeat: 'repeat' });
    expect(shaded.style['background-size']).toBe('100% 100%, 50px 50px');
    expect(shaded.style['background-repeat']).toBe('no-repeat, repeat');
  });

  it('hands the texture back untouched when there is nothing to read', () => {
    expect(shadedBackgroundGrid('a.png', [], 0, 0).image).toBe('url(a.png)');
  });
});

describe('the colour a face is darkened with', () => {
  it('reads a colour written six digits at a time', () => {
    expect(shadeRgbOf('#05060a')).toBe('5,6,10');
    expect(shadeRgbOf('05060a')).toBe('5,6,10');
  });

  it('reads a colour written three digits at a time', () => {
    expect(shadeRgbOf('#abc')).toBe('170,187,204');
  });

  it('falls back to black for anything it cannot read', () => {
    expect(shadeRgbOf('')).toBe('0,0,0');
    expect(shadeRgbOf(null)).toBe('0,0,0');
    expect(shadeRgbOf('rebeccapurple')).toBe('0,0,0');
  });

  it('darkens a face in the colour the table paints its dark with', () => {
    expect(shadedBackgroundImage('a.png', 0.5, '5,6,10')).toContain('rgba(5,6,10,0.500)');
  });

  it('darkens in black where the table has said nothing', () => {
    expect(shadedBackgroundImage('a.png', 0.5)).toContain('rgba(0,0,0,0.500)');
  });

  it('carries the colour into a face shaded a cell at a time', () => {
    const shaded = shadedBackgroundGrid('a.png', [0.2, 0.8], 2, 1, STRETCHED_TEXTURE, '5,6,10');

    expect(shaded.image).toContain('rgba(5,6,10,0.800)');
    expect(shaded.image).toContain('rgba(5,6,10,0.200)');
  });
});
