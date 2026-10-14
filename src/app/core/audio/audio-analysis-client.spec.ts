import { ANALYZABLE_MAX_BYTES, analyzeAudioBlobAsync } from '@axe/core/audio/audio-analysis-client';

describe('analyzeAudioBlobAsync()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads nothing from an empty file or one too large to hold decoded', async () => {
    const tooLarge = { size: ANALYZABLE_MAX_BYTES + 1, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } as Blob;

    await expect(analyzeAudioBlobAsync(new Blob([]))).resolves.toBeNull();
    await expect(analyzeAudioBlobAsync(tooLarge)).resolves.toBeNull();
  });

  it('reads nothing where the browser cannot decode', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined);
    vi.stubGlobal('webkitOfflineAudioContext', undefined);

    await expect(analyzeAudioBlobAsync(new Blob([new Uint8Array([1, 2, 3])]))).resolves.toBeNull();
  });

  it('decodes at the analysis rate and reads the sound on the page without a worker', async () => {
    const rate = 22050;
    const left = new Float32Array(rate);
    const right = new Float32Array(rate);
    for (let i = 2205; i < rate; i++) {
      left[i] = 0.5 * Math.sin((2 * Math.PI * 997 * i) / rate);
      right[i] = left[i];
    }
    const rates: number[] = [];
    class FakeOfflineContext {
      constructor(_channels: number, _length: number, sampleRate: number) {
        rates.push(sampleRate);
      }
      decodeAudioData(_data: ArrayBuffer, resolve: (buffer: AudioBuffer) => void) {
        resolve({
          numberOfChannels: 2,
          sampleRate: rate,
          getChannelData: (channel: number) => (channel === 0 ? left : right),
        } as unknown as AudioBuffer);
      }
    }
    vi.stubGlobal('OfflineAudioContext', FakeOfflineContext);
    vi.stubGlobal('Worker', undefined);

    const result = await analyzeAudioBlobAsync(new Blob([new Uint8Array([1, 2, 3])]));

    expect(rates).toEqual([22050]);
    expect(result).not.toBeNull();
    expect(result!.duration).toBeCloseTo(1, 5);
    expect(Math.abs(result!.start - 0.1)).toBeLessThan(0.011);
    expect(result!.peak).toBeCloseTo(20 * Math.log10(0.5), 1);
    expect(result!.bpm).toBeNull();
  });
});
