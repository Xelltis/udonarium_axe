import { ViewContainerRef } from '@angular/core';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';

describe('OverlayLayers', () => {
  const main = {} as ViewContainerRef;
  const other = {} as ViewContainerRef;

  function paper(focused: boolean): Document {
    return { hasFocus: () => focused } as unknown as Document;
  }

  afterEach(() => OverlayLayers.reset());

  it('names no layer while nothing has left the main window', () => {
    expect(OverlayLayers.current()).toBeNull();
  });

  it('names the layer of the window being worked in', () => {
    OverlayLayers.attach(paper(false), main);
    OverlayLayers.attach(paper(true), other);

    expect(OverlayLayers.current()).toBe(other);
  });

  it('falls back to the main window when the reader is in it', () => {
    OverlayLayers.attach(paper(false), other);

    expect(OverlayLayers.current()).toBeNull();
  });

  it('forgets a window that has gone', () => {
    const gone = paper(true);
    OverlayLayers.attach(gone, other);
    OverlayLayers.detach(gone);

    expect(OverlayLayers.current()).toBeNull();
  });

  it('answers for a document that cannot say whether it is focused', () => {
    OverlayLayers.attach({} as Document, other);

    expect(OverlayLayers.current()).toBeNull();
  });
});
