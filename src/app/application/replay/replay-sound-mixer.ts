import { Injectable } from '@angular/core';
import { Logger } from '@axe/core/logging/logger';
import type { EncodedAudio } from '@axe/core/media/video-encoder';
import type { ReplaySoundtrack } from '@axe/domain/replay/replay-soundtrack';

export const REPLAY_AUDIO_SAMPLE_RATE = 48_000;
export const REPLAY_AUDIO_CHANNELS = 2;

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
  mix(soundtrack: ReplaySoundtrack, read: ReplayAudioSource): Promise<EncodedAudio | null> {
    return mixReplaySoundtrack(soundtrack, read);
  }
}

/**
 * Renders a replay's sound effects and music into one stereo track for a video.
 *
 * Music loops for as long as its cue lasts and fades in and out. A sound that cannot be read or
 * decoded is left out. Answers null when the browser cannot mix, the soundtrack is empty, or none
 * of its sounds could be read.
 */
export async function mixReplaySoundtrack(
  soundtrack: ReplaySoundtrack,
  read: ReplayAudioSource
): Promise<EncodedAudio | null> {
  if (!isSoundMixingSupported() || soundtrack.totalMs < 1) return null;

  const cues = [...soundtrack.effects, ...soundtrack.music];
  if (cues.length < 1) return null;

  const context = new OfflineAudioContext({
    numberOfChannels: REPLAY_AUDIO_CHANNELS,
    sampleRate: REPLAY_AUDIO_SAMPLE_RATE,
    length: Math.max(1, Math.ceil((soundtrack.totalMs / 1000) * REPLAY_AUDIO_SAMPLE_RATE)),
  });

  const buffers = new Map<string, AudioBuffer>();
  for (const identifier of new Set(cues.map((cue) => cue.audioIdentifier))) {
    const encoded = await read(identifier);
    if (!encoded) continue;
    try {
      buffers.set(identifier, await context.decodeAudioData(encoded));
    } catch (reason) {
      Logger.warn('[ReplaySound] 音を読めませんでした', identifier, reason);
    }
  }
  if (buffers.size < 1) return null;

  for (const cue of soundtrack.effects) {
    const buffer = buffers.get(cue.audioIdentifier);
    if (buffer) play(context, buffer, cue.startMs / 1000, cue.gain, cue.offsetMs / 1000);
  }

  for (const cue of soundtrack.music) {
    const buffer = buffers.get(cue.audioIdentifier);
    if (!buffer) continue;
    const startedAt = cue.startMs / 1000;
    const duration = (cue.endMs - cue.startMs) / 1000;
    const gain = play(context, buffer, startedAt, cue.gain, cue.offsetMs / 1000, duration, true);
    const fade = Math.min(cue.fadeMs / 1000, duration / 2);
    if (fade > 0) {
      gain.gain.setValueAtTime(0, startedAt);
      gain.gain.linearRampToValueAtTime(cue.gain, startedAt + fade);
      gain.gain.setValueAtTime(cue.gain, startedAt + duration - fade);
      gain.gain.linearRampToValueAtTime(0, startedAt + duration);
    }
  }

  const rendered = await context.startRendering();
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
    channels.push(rendered.getChannelData(channel));
  }
  return { sampleRate: rendered.sampleRate, channels };
}

function play(
  context: OfflineAudioContext,
  buffer: AudioBuffer,
  startedAt: number,
  gainValue: number,
  offset: number,
  duration?: number,
  loop = false
): GainNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;

  const gain = context.createGain();
  gain.gain.value = gainValue;
  source.connect(gain).connect(context.destination);

  const from = buffer.duration > 0 ? offset % buffer.duration : 0;
  if (duration === undefined) source.start(startedAt, from);
  else source.start(startedAt, from, duration);
  return gain;
}
