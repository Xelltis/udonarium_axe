import { Fft } from '@axe/core/audio/fft';

describe('Fft', () => {
  it('refuses a size that is not a power of two', () => {
    expect(() => new Fft(300)).toThrow();
    expect(() => new Fft(1)).toThrow();
  });

  it('puts a sine wholly in the bin of its frequency', () => {
    const size = 64;
    const fft = new Fft(size);
    const frame = Array.from({ length: size }, (_, i) => Math.sin((2 * Math.PI * 5 * i) / size));
    const out = fft.magnitudes(frame, new Float32Array(size / 2 + 1));

    expect(out[5]).toBeCloseTo(size / 2, 3);
    for (let k = 0; k <= size / 2; k++) {
      if (k !== 5) expect(out[k]).toBeLessThan(1e-6);
    }
  });

  it('reads a constant as strength at no frequency', () => {
    const fft = new Fft(16);
    const out = fft.magnitudes(new Array(16).fill(0.5), new Float32Array(9));

    expect(out[0]).toBeCloseTo(8, 6);
    expect(out[3]).toBeLessThan(1e-9);
  });

  it('pads a short frame with silence', () => {
    const fft = new Fft(8);
    const out = fft.magnitudes([1], new Float32Array(5));

    expect(Array.from(out)).toEqual([1, 1, 1, 1, 1]);
  });
});
