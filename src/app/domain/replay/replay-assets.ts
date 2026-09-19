import { type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

const IMAGE_KEY = /ImageIdentifier$|^imageIdentifier$/;
const AUDIO_KEY = /AudioIdentifier$|^audioIdentifier$/;

export interface ReplayAssetIds {
  readonly images: ReadonlySet<string>;
  readonly audios: ReadonlySet<string>;
}

/**
 * The pictures and sounds a recording refers to, so they can be packed alongside it.
 *
 * Any non-empty string under a key named `imageIdentifier` or `audioIdentifier`, or ending in
 * either, counts, wherever it sits in the snapshots or the events. A sound effect event adds
 * the sound it played.
 */
export function collectReplayAssetIds(
  snapshots: readonly ReplayObjectSnapshot[],
  events: readonly ReplayEvent[]
): ReplayAssetIds {
  const images = new Set<string>();
  const audios = new Set<string>();

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === 'string') {
        if (child.length < 1) continue;
        if (IMAGE_KEY.test(key)) images.add(child);
        else if (AUDIO_KEY.test(key)) audios.add(child);
        continue;
      }
      walk(child);
    }
  };

  for (const snapshot of snapshots) walk(snapshot.syncData);
  for (const event of events) {
    walk(event.detail);
    if (event.patch) walk(event.patch.after);
    for (const part of event.parts ?? []) walk(part.after);
    if (event.signal) walk(event.signal.data);
    if (event.kind === ReplayEventKind.MediaSoundEffect) {
      const identifier = String(event.detail['identifier'] ?? '');
      if (identifier.length > 0) audios.add(identifier);
    }
  }

  return { images, audios };
}
