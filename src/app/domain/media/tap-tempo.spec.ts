import { TapTempo } from '@axe/domain/media/tap-tempo';

describe('TapTempo', () => {
  it('gives no tempo from a single tap', () => {
    const tempo = new TapTempo();

    expect(tempo.tap({ atMs: 1000, position: 1 })).toBeNull();
  });

  it('gives the tempo of the average gap between taps', () => {
    const tempo = new TapTempo();
    tempo.tap({ atMs: 0, position: 0 });
    tempo.tap({ atMs: 480, position: 0.48 });
    tempo.tap({ atMs: 1010, position: 1.01 });

    expect(tempo.tap({ atMs: 1500, position: 1.5 })).toBeCloseTo(120, 6);
    expect(tempo.count).toBe(4);
    expect(tempo.last).toEqual({ atMs: 1500, position: 1.5 });
  });

  it('keeps only the latest taps', () => {
    const tempo = new TapTempo();
    for (let tap = 0; tap < 4; tap++) tempo.tap({ atMs: tap * 1000, position: 0 });
    for (let tap = 0; tap < TapTempo.KEPT; tap++) tempo.tap({ atMs: 3500 + tap * 500, position: 0 });

    expect(tempo.count).toBe(TapTempo.KEPT);
    expect(tempo.bpm).toBeCloseTo(120, 6);
  });

  it('starts again after a pause or a tap out of order', () => {
    const tempo = new TapTempo();
    tempo.tap({ atMs: 0, position: 0 });
    tempo.tap({ atMs: 500, position: 0 });

    tempo.tap({ atMs: 500 + TapTempo.RESET_MS + 1, position: 0 });
    expect(tempo.count).toBe(1);

    tempo.tap({ atMs: 100, position: 0 });
    expect(tempo.count).toBe(1);

    tempo.reset();
    expect(tempo.bpm).toBeNull();
  });
});
