import { InputHandler } from '@axe/ui/directives/input-handler';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('InputHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('listens for the touch a press starts with as one its handler may cancel, saying so', () => {
    const element = document.createElement('div');
    const added = vi.spyOn(element, 'addEventListener');

    const handler = new InputHandler(element, { capture: true });

    expect(added).toHaveBeenCalledWith('touchstart', expect.any(Function), { capture: true, passive: false });
    handler.destroy();
  });
});
