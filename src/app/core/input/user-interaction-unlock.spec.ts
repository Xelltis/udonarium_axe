import { onFirstUserInteraction } from '@axe/core/input/user-interaction-unlock';

describe('onFirstUserInteraction', () => {
  it('fires on the first press and unhooks itself', () => {
    const cb = vi.fn();
    onFirstUserInteraction(cb);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(1);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('waits for a finger to lift rather than to land, which is when iOS lets audio start', () => {
    const cb = vi.fn();
    const unsubscribe = onFirstUserInteraction(cb);

    document.body.dispatchEvent(new Event('touchstart', { bubbles: true }));
    expect(cb).not.toHaveBeenCalled();

    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('fires on a key as well', () => {
    const cb = vi.fn();
    onFirstUserInteraction(cb);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('never fires once the returned function unhooks it', () => {
    const cb = vi.fn();
    const unsubscribe = onFirstUserInteraction(cb);

    unsubscribe();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(cb).not.toHaveBeenCalled();
  });
});
