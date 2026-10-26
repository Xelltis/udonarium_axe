import { observeSize } from '@axe/core/util/observe-size';

describe('observeSize()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hands over the content size in whole pixels, and stops when asked', () => {
    let report: ResizeObserverCallback = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          report = callback;
        }
        observe(): void {}
        disconnect = disconnect;
      }
    );
    const sizes: { width: number; height: number }[] = [];

    const stop = observeSize(document.createElement('div'), (size) => sizes.push(size));
    report([{ contentRect: { width: 120.4, height: 80.6 } } as ResizeObserverEntry], {} as ResizeObserver);
    stop();

    expect(sizes).toEqual([{ width: 120, height: 81 }]);
    expect(disconnect).toHaveBeenCalled();
  });

  it('watches nothing where the browser cannot', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    expect(() => observeSize(document.createElement('div'), () => undefined)()).not.toThrow();
  });
});
