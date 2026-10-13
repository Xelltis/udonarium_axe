/**
 * A radix-2 fast Fourier transform for one frame size, set up once and run on many frames.
 *
 * Only what reading music needs is here: the strength of each frequency in a frame of real samples.
 */
export class Fft {
  /** The number of samples in a frame, a power of two. */
  readonly size: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly reversed: Uint32Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(size: number) {
    if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two: ${size}`);
    }
    this.size = size;
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    const bits = Math.log2(size);
    this.reversed = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let reversed = 0;
      for (let bit = 0; bit < bits; bit++) reversed |= ((i >> bit) & 1) << (bits - 1 - bit);
      this.reversed[i] = reversed;
    }
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
  }

  /**
   * The magnitude of each frequency bin from 0 up to half the frame size, for a frame of real
   * samples, written into `out`, which must hold `size / 2 + 1` values.
   *
   * A frame shorter than the size is padded with silence.
   */
  magnitudes(frame: ArrayLike<number>, out: Float32Array): Float32Array {
    const { size, re, im, reversed } = this;
    for (let i = 0; i < size; i++) {
      const from = reversed[i];
      re[i] = from < frame.length ? frame[from] : 0;
      im[i] = 0;
    }
    for (let span = 2; span <= size; span *= 2) {
      const half = span / 2;
      const stride = size / span;
      for (let start = 0; start < size; start += span) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * stride];
          const wi = this.sin[k * stride];
          const a = start + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    for (let k = 0; k <= size / 2; k++) out[k] = Math.hypot(re[k], im[k]);
    return out;
  }
}
