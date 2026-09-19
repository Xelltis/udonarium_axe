import { Injectable } from '@angular/core';
import { Logger } from '@axe/core/logging/logger';
import type { VideoSoundSource } from '@axe/core/media/video-encoder';
import type { ReplayBgmCue, ReplaySoundCue, ReplaySoundtrack } from '@axe/domain/replay/replay-soundtrack';

export const REPLAY_AUDIO_SAMPLE_RATE = 48_000;
export const REPLAY_AUDIO_CHANNELS = 2;
/** The level the mix is held under, in decibels below full scale. */
export const REPLAY_LIMIT_DB = -1.5;
/**
 * How much of the mix before a stretch is rendered with it and thrown away, in seconds, so the
 * limiter comes into each stretch as it left the one before.
 */
export const REPLAY_MIX_LEAD_IN_SECONDS = 1;
/**
 * How much decoded sound the mix keeps at once, in bytes. Decoded, a few minutes of music comes to
 * tens of megabytes, so a session with many tracks cannot hold them all; the one least recently
 * mixed is let go and decoded again if it is wanted later.
 */
export const REPLAY_DECODED_SOUND_BUDGET_BYTES = 256 * 1024 * 1024;

export type ReplayAudioSource = (audioIdentifier: string) => Promise<ArrayBuffer | null>;

/** Whether this browser can mix sound offline, which a video needs to carry any. */
export function isSoundMixingSupported(): boolean {
  return typeof OfflineAudioContext !== 'undefined';
}

@Injectable({ providedIn: 'root' })
export class ReplaySoundMixer {
  /** Whether this browser can mix a replay's sound. */
  get isSupported(): boolean {
    return isSoundMixingSupported();
  }

  /** Mixes a replay's soundtrack; see `mixReplaySoundtrack`. */
  mix(soundtrack: ReplaySoundtrack, read: ReplayAudioSource): Promise<VideoSoundSource | null> {
    return mixReplaySoundtrack(soundtrack, read);
  }
}

/**
 * A replay's sound effects and music as one stereo track for a video, mixed a stretch at a time as
 * the video asks for it.
 *
 * Each sound is read and decoded up front to learn how long it runs. A stretch is then rendered on
 * its own, with the sounds that fall in it placed within it and those running into it picked up
 * where they had got to; music loops for as long as its cue lasts and fades in and out. The whole
 * mix passes through a limiter so nothing clips, and each stretch is rendered with a second of what
 * came before so the limiter does not start afresh at its edge. However long the video, only a few
 * seconds of the mix are held at once, and of the decoded sounds only as many as `budgetBytes`
 * allows besides those the stretch in hand needs. A sound that cannot be read or decoded is left
 * out. Answers null when the browser cannot mix, the soundtrack is empty, or none of its sounds
 * could be read.
 */
export async function mixReplaySoundtrack(
  soundtrack: ReplaySoundtrack,
  read: ReplayAudioSource,
  budgetBytes = REPLAY_DECODED_SOUND_BUDGET_BYTES
): Promise<VideoSoundSource | null> {
  if (!isSoundMixingSupported() || soundtrack.totalMs < 1) return null;

  const cues = [...soundtrack.effects, ...soundtrack.music];
  if (cues.length < 1) return null;

  const shelf = new ReplaySoundShelf(read, budgetBytes);
  for (const identifier of new Set(cues.map((cue) => cue.audioIdentifier))) await shelf.learn(identifier);
  if (shelf.isEmpty) return null;

  const length = Math.max(1, Math.ceil((soundtrack.totalMs / 1000) * REPLAY_AUDIO_SAMPLE_RATE));
  return {
    sampleRate: REPLAY_AUDIO_SAMPLE_RATE,
    numberOfChannels: REPLAY_AUDIO_CHANNELS,
    length,
    read: (start, count) => renderStretch(soundtrack, shelf, start, Math.max(0, Math.min(count, length - start))),
  };
}

/**
 * The decoded sounds of a mix: how long each runs, and the sounds themselves for as many as the
 * budget allows, the least recently used let go first.
 */
class ReplaySoundShelf {
  private readonly decoder = new OfflineAudioContext({
    numberOfChannels: REPLAY_AUDIO_CHANNELS,
    sampleRate: REPLAY_AUDIO_SAMPLE_RATE,
    length: 1,
  });
  private readonly durations = new Map<string, number>();
  private readonly held = new Map<string, AudioBuffer>();
  private heldBytes = 0;

  constructor(
    private readonly read: ReplayAudioSource,
    private readonly budgetBytes: number
  ) {}

  get isEmpty(): boolean {
    return this.durations.size < 1;
  }

  /** How long a sound runs, in seconds, or null for one that could not be read. */
  durationOf(identifier: string): number | null {
    return this.durations.get(identifier) ?? null;
  }

  /** Reads and decodes a sound for the first time, to learn how long it runs. */
  async learn(identifier: string): Promise<void> {
    const buffer = await this.decode(identifier);
    if (!buffer) return;
    this.durations.set(identifier, buffer.duration);
    this.held.set(identifier, buffer);
    this.heldBytes += bytesOf(buffer);
    this.evict(new Set([identifier]));
  }

  /** The decoded sounds a stretch needs, decoding again any that were let go. */
  async take(identifiers: ReadonlySet<string>): Promise<ReadonlyMap<string, AudioBuffer>> {
    const taken = new Map<string, AudioBuffer>();
    for (const identifier of identifiers) {
      if (!this.durations.has(identifier)) continue;
      const held = this.held.get(identifier);
      const buffer = held ?? (await this.decode(identifier));
      if (!buffer) continue;
      if (held) this.held.delete(identifier);
      else this.heldBytes += bytesOf(buffer);
      this.held.set(identifier, buffer);
      taken.set(identifier, buffer);
    }
    this.evict(identifiers);
    return taken;
  }

  private evict(needed: ReadonlySet<string>): void {
    for (const [identifier, buffer] of this.held) {
      if (this.heldBytes <= this.budgetBytes) return;
      if (needed.has(identifier)) continue;
      this.held.delete(identifier);
      this.heldBytes -= bytesOf(buffer);
    }
  }

  /**
   * Reads and decodes a sound, or null when either fails. A sound read again partway through a
   * long export may fail where it did not at first; that sound is left out of the stretch rather
   * than the export being lost.
   */
  private async decode(identifier: string): Promise<AudioBuffer | null> {
    try {
      const encoded = await this.read(identifier);
      if (!encoded) return null;
      return await this.decoder.decodeAudioData(encoded);
    } catch (reason) {
      Logger.warn('[ReplaySound] 音を読めませんでした', identifier, reason);
      return null;
    }
  }
}

function bytesOf(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
}

/** Renders the frames of the mix from `start`, `count` of them, with a lead-in rendered and dropped. */
async function renderStretch(
  soundtrack: ReplaySoundtrack,
  shelf: ReplaySoundShelf,
  start: number,
  count: number
): Promise<Float32Array[]> {
  if (count < 1) return Array.from({ length: REPLAY_AUDIO_CHANNELS }, () => new Float32Array(0));
  const rate = REPLAY_AUDIO_SAMPLE_RATE;
  const leadIn = Math.min(start, Math.round(REPLAY_MIX_LEAD_IN_SECONDS * rate));
  const from = (start - leadIn) / rate;
  const until = (start + count) / rate;
  const buffers = await shelf.take(soundsIn(soundtrack, shelf, from, until));

  const context = new OfflineAudioContext({
    numberOfChannels: REPLAY_AUDIO_CHANNELS,
    sampleRate: rate,
    length: leadIn + count,
  });
  const output = limiterOf(context);

  for (const cue of soundtrack.effects) {
    const buffer = buffers.get(cue.audioIdentifier);
    if (buffer) placeEffect(context, output, buffer, cue, from, until);
  }
  for (const cue of soundtrack.music) {
    const buffer = buffers.get(cue.audioIdentifier);
    if (buffer) placeMusic(context, output, buffer, cue, from, until);
  }

  const rendered = await context.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel).slice(leadIn, leadIn + count));
  }
  return channels;
}

/** The sounds heard between `from` and `until` seconds: effects still ringing, and music whose cue spans it. */
function soundsIn(soundtrack: ReplaySoundtrack, shelf: ReplaySoundShelf, from: number, until: number): Set<string> {
  const heard = new Set<string>();
  for (const cue of soundtrack.effects) {
    const duration = shelf.durationOf(cue.audioIdentifier);
    if (duration === null) continue;
    const startedAt = cue.startMs / 1000;
    const offset = duration > 0 ? (cue.offsetMs / 1000) % duration : 0;
    if (startedAt < until && startedAt + duration - offset > from) heard.add(cue.audioIdentifier);
  }
  for (const cue of soundtrack.music) {
    if (cue.startMs / 1000 < until && cue.endMs / 1000 > from) heard.add(cue.audioIdentifier);
  }
  return heard;
}

/** A sound effect, placed in a stretch running from `from` to `until` seconds, if any of it falls there. */
function placeEffect(
  context: OfflineAudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  cue: ReplaySoundCue,
  from: number,
  until: number
): void {
  const startedAt = cue.startMs / 1000;
  const offset = buffer.duration > 0 ? (cue.offsetMs / 1000) % buffer.duration : 0;
  const endsAt = startedAt + buffer.duration - offset;
  if (endsAt <= from || startedAt >= until) return;
  const { source } = sourceOf(context, output, buffer, cue.gain, false);
  const late = Math.max(0, from - startedAt);
  source.start(Math.max(0, startedAt - from), offset + late);
}

/**
 * A piece of music, placed in a stretch running from `from` to `until` seconds, looping from where it
 * had got to and fading in and out at its own ends.
 */
function placeMusic(
  context: OfflineAudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  cue: ReplayBgmCue,
  from: number,
  until: number
): void {
  const startedAt = cue.startMs / 1000;
  const endsAt = cue.endMs / 1000;
  const begin = Math.max(startedAt, from);
  const end = Math.min(endsAt, until);
  if (end <= begin) return;

  const { source, gain } = sourceOf(context, output, buffer, cue.gain, true);
  const position = buffer.duration > 0 ? (cue.offsetMs / 1000 + (begin - startedAt)) % buffer.duration : 0;
  source.start(begin - from, position, end - begin);

  const fade = Math.min(cue.fadeMs / 1000, (endsAt - startedAt) / 2);
  if (fade <= 0) return;
  const gainAt = (time: number) =>
    cue.gain * Math.max(0, Math.min(1, (time - startedAt) / fade, (endsAt - time) / fade));
  gain.gain.setValueAtTime(gainAt(begin), begin - from);
  const turns = [startedAt + fade, endsAt - fade, end].filter((time) => time > begin && time <= end);
  for (const time of [...new Set(turns)].sort((a, b) => a - b)) {
    gain.gain.linearRampToValueAtTime(gainAt(time), time - from);
  }
}

function sourceOf(
  context: OfflineAudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  gainValue: number,
  loop: boolean
): { source: AudioBufferSourceNode; gain: GainNode } {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  const gain = context.createGain();
  gain.gain.value = gainValue;
  source.connect(gain).connect(output);
  return { source, gain };
}

/**
 * A limiter every sound passes through on its way out, so an effect landing on loud music is held
 * just under full scale instead of clipping. A context that cannot make one sends the sound
 * straight out.
 */
function limiterOf(context: OfflineAudioContext): AudioNode {
  if (typeof context.createDynamicsCompressor !== 'function') return context.destination;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = REPLAY_LIMIT_DB;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(context.destination);
  return limiter;
}
