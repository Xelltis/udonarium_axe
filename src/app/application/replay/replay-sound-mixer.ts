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
 * Each sound is read and decoded once, up front. A stretch is then rendered on its own, with the
 * sounds that fall in it placed within it and those running into it picked up where they had got
 * to; music loops for as long as its cue lasts and fades in and out. The whole mix passes through a
 * limiter so nothing clips, and each stretch is rendered with a second of what came before so the
 * limiter does not start afresh at its edge. However long the video, only a few seconds of the mix
 * are held at once. A sound that cannot be read or decoded is left out. Answers null when the
 * browser cannot mix, the soundtrack is empty, or none of its sounds could be read.
 */
export async function mixReplaySoundtrack(
  soundtrack: ReplaySoundtrack,
  read: ReplayAudioSource
): Promise<VideoSoundSource | null> {
  if (!isSoundMixingSupported() || soundtrack.totalMs < 1) return null;

  const cues = [...soundtrack.effects, ...soundtrack.music];
  if (cues.length < 1) return null;

  const decoder = new OfflineAudioContext({
    numberOfChannels: REPLAY_AUDIO_CHANNELS,
    sampleRate: REPLAY_AUDIO_SAMPLE_RATE,
    length: 1,
  });
  const buffers = new Map<string, AudioBuffer>();
  for (const identifier of new Set(cues.map((cue) => cue.audioIdentifier))) {
    const encoded = await read(identifier);
    if (!encoded) continue;
    try {
      buffers.set(identifier, await decoder.decodeAudioData(encoded));
    } catch (reason) {
      Logger.warn('[ReplaySound] 音を読めませんでした', identifier, reason);
    }
  }
  if (buffers.size < 1) return null;

  const length = Math.max(1, Math.ceil((soundtrack.totalMs / 1000) * REPLAY_AUDIO_SAMPLE_RATE));
  return {
    sampleRate: REPLAY_AUDIO_SAMPLE_RATE,
    numberOfChannels: REPLAY_AUDIO_CHANNELS,
    length,
    read: (start, count) => renderStretch(soundtrack, buffers, start, Math.max(0, Math.min(count, length - start))),
  };
}

/** Renders the frames of the mix from `start`, `count` of them, with a lead-in rendered and dropped. */
async function renderStretch(
  soundtrack: ReplaySoundtrack,
  buffers: ReadonlyMap<string, AudioBuffer>,
  start: number,
  count: number
): Promise<Float32Array[]> {
  if (count < 1) return Array.from({ length: REPLAY_AUDIO_CHANNELS }, () => new Float32Array(0));
  const rate = REPLAY_AUDIO_SAMPLE_RATE;
  const leadIn = Math.min(start, Math.round(REPLAY_MIX_LEAD_IN_SECONDS * rate));
  const context = new OfflineAudioContext({
    numberOfChannels: REPLAY_AUDIO_CHANNELS,
    sampleRate: rate,
    length: leadIn + count,
  });
  const output = limiterOf(context);
  const from = (start - leadIn) / rate;
  const until = (start + count) / rate;

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
