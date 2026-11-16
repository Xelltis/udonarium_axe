import { paintedColorOf } from '@axe/core/util/painted-color';

describe('a colour taken apart from its clearness', () => {
  it('reads a colour as the page reports one it has worked out, solid or partly clear', () => {
    expect(paintedColorOf('rgb(22, 27, 34)')).toEqual({ colour: '#161b22', opacity: 1 });
    expect(paintedColorOf('rgba(232, 221, 237, 0.95)')).toEqual({ colour: '#e8dded', opacity: 0.95 });
    expect(paintedColorOf(' rgba(0, 0, 0, 0) ')).toEqual({ colour: '#000000', opacity: 0 });
  });

  it('reads the parts written with spaces and a slash, and a clearness in percent', () => {
    expect(paintedColorOf('rgb(22 27 34 / 0.9)')).toEqual({ colour: '#161b22', opacity: 0.9 });
    expect(paintedColorOf('rgb(22 27 34 / 50%)')).toEqual({ colour: '#161b22', opacity: 0.5 });
    expect(paintedColorOf('rgb(21.6, 300, 34)')).toEqual({ colour: '#16ff22', opacity: 1 });
  });

  it('reads a colour written in hex as solid', () => {
    expect(paintedColorOf('#f4f1e8')).toEqual({ colour: '#f4f1e8', opacity: 1 });
    expect(paintedColorOf('#abc')).toEqual({ colour: '#aabbcc', opacity: 1 });
  });

  it('reads nothing from a colour written any other way', () => {
    for (const text of [
      '',
      'transparent',
      'red',
      'oklch(0.5 0.1 200)',
      'color(srgb 0.1 0.2 0.3)',
      'rgb(1, 2)',
      'f4f1e8',
    ]) {
      expect(paintedColorOf(text), text).toBeNull();
    }
  });
});
