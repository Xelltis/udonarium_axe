import { capturePointer, releasePointer } from '@axe/core/input/pointer-capture';

describe('holding on to a pointer', () => {
  function element(held: boolean) {
    return {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => held),
    };
  }

  it('takes the pointer, and lets a browser that has already let it go pass without a fuss', () => {
    const taking = element(false);
    capturePointer(taking as unknown as EventTarget, 7);
    expect(taking.setPointerCapture).toHaveBeenCalledWith(7);

    const refusing = {
      setPointerCapture: () => {
        throw new DOMException('No active pointer', 'NotFoundError');
      },
    };
    expect(() => capturePointer(refusing as unknown as EventTarget, 7)).not.toThrow();
    expect(() => capturePointer(null, 7)).not.toThrow();
  });

  it('lets go only of a pointer the element still holds', () => {
    const holding = element(true);
    const notHolding = element(false);

    releasePointer(holding as unknown as EventTarget, 7);
    releasePointer(notHolding as unknown as EventTarget, 7);

    expect(holding.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(notHolding.releasePointerCapture).not.toHaveBeenCalled();
  });
});
