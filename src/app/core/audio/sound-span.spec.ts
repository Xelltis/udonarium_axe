import { findSoundSpan } from '@axe/core/audio/sound-span';

describe('findSoundSpan()', () => {
  const rate = 1000;

  it('finds where a sound starts and stops inside silence', () => {
    const samples = new Float32Array(3 * rate);
    for (let i = 500; i < 2200; i++) samples[i] = 0.3 * Math.sin(i);
    const span = findSoundSpan([samples], rate);

    expect(span.start).toBeCloseTo(0.5, 2);
    expect(span.end).toBeCloseTo(2.2, 2);
  });

  it('counts a sound heard in only one channel', () => {
    const left = new Float32Array(rate);
    const right = new Float32Array(rate);
    for (let i = 100; i < 300; i++) right[i] = 0.2;
    const span = findSoundSpan([left, right], rate);

    expect(span.start).toBeCloseTo(0.1, 2);
    expect(span.end).toBeCloseTo(0.3, 2);
  });

  it('treats hiss far below a fade as silence', () => {
    const samples = new Float32Array(2 * rate);
    for (let i = 0; i < samples.length; i++) samples[i] = 0.00001 * Math.sin(i);
    for (let i = 400; i < 900; i++) samples[i] = 0.5;

    expect(findSoundSpan([samples], rate)).toEqual({ start: 0.4, end: 0.9 });
  });

  it('reads a silent sound as starting and stopping at 0', () => {
    expect(findSoundSpan([new Float32Array(rate)], rate)).toEqual({ start: 0, end: 0 });
    expect(findSoundSpan([], rate)).toEqual({ start: 0, end: 0 });
  });
});
