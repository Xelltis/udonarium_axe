import { ViewContainerRef } from '@angular/core';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';

describe('OverlayLayers', () => {
  const main = {} as ViewContainerRef;
  const other = {} as ViewContainerRef;
  let layers: OverlayLayers;

  function paper(focused: boolean): Document {
    return { hasFocus: () => focused } as unknown as Document;
  }

  beforeEach(() => {
    layers = new OverlayLayers();
  });

  it('names no layer while nothing has left the main window', () => {
    expect(layers.current()).toBeNull();
  });

  it('names the layer of the window being worked in', () => {
    layers.attach(paper(false), main);
    layers.attach(paper(true), other);

    expect(layers.current()).toBe(other);
  });

  it('falls back to the main window when the reader is in it', () => {
    layers.attach(paper(false), other);

    expect(layers.current()).toBeNull();
  });

  it('forgets a window that has gone', () => {
    const gone = paper(true);
    layers.attach(gone, other);
    layers.detach(gone);

    expect(layers.current()).toBeNull();
  });

  it('answers for a document that cannot say whether it is focused', () => {
    layers.attach({} as Document, other);

    expect(layers.current()).toBeNull();
  });

  describe('layerFor', () => {
    it('names the layer of the window a document belongs to, whichever has the focus', () => {
      const window = paper(false);
      layers.attach(paper(true), main);
      layers.attach(window, other);

      expect(layers.layerFor(window)).toBe(other);
    });

    it('names nothing for the main window, or for no document at all', () => {
      layers.attach(paper(true), other);

      expect(layers.layerFor(document)).toBeNull();
      expect(layers.layerFor(null)).toBeNull();
    });

    it('forgets a window that has gone', () => {
      const gone = paper(false);
      layers.attach(gone, other);
      layers.detach(gone);

      expect(layers.layerFor(gone)).toBeNull();
    });
  });

  describe('front', () => {
    it('names the window being worked in over the main one', () => {
      layers.main = main;
      layers.attach(paper(true), other);

      expect(layers.front()).toBe(other);
    });

    it('names the main layer while the reader is in the main window', () => {
      layers.main = main;
      layers.attach(paper(false), other);

      expect(layers.front()).toBe(main);
    });

    it('throws before the app has handed over its main layer', () => {
      expect(() => layers.front()).toThrow(/main layer/);
      expect(() => layers.mainLayer()).toThrow(/main layer/);
    });
  });
});
