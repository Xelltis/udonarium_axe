/**
 * The bytes of a WAV file of silence that names where it loops in its sampler chunk, as a sound
 * editor writes one, for specs that need a track asking to be looped.
 *
 * The loop is given in samples, its end sample part of the loop. Without a loop the file has no
 * sampler chunk at all.
 */
export function loopTaggedWav(
  loop: { start: number; end: number } | null,
  { rate = 8000, channels = 2, frames = 8000 } = {}
): Uint8Array<ArrayBuffer> {
  const blockAlign = channels * 2;
  const fmt = chunk('fmt ', [
    ...u16(1),
    ...u16(channels),
    ...u32(rate),
    ...u32(rate * blockAlign),
    ...u16(blockAlign),
    ...u16(16),
  ]);
  // Seven fields of the instrument, the number of loops and the sampler's own data, then one loop
  // of cue point, type, first sample, last sample, fraction and play count.
  const smpl = loop
    ? chunk(
        'smpl',
        [0, 0, 0, 60, 0, 0, 0, 1, 0, 0, 0, loop.start, loop.end, 0, 0].flatMap((field) => u32(field))
      )
    : [];
  const data = chunk('data', new Array<number>(frames * blockAlign).fill(0));
  const body = [...ascii('WAVE'), ...fmt, ...smpl, ...data];
  return Uint8Array.from([...ascii('RIFF'), ...u32(body.length), ...body]);
}

/** A blob of a {@link loopTaggedWav}, as a file put in the room would hold it. */
export function loopTaggedWavBlob(
  loop: { start: number; end: number } | null,
  options?: { rate?: number; frames?: number }
): Blob {
  return new Blob([loopTaggedWav(loop, options)], { type: 'audio/wav' });
}

function chunk(id: string, body: number[]): number[] {
  return [...ascii(id), ...u32(body.length), ...body, ...(body.length % 2 ? [0] : [])];
}

function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
}
