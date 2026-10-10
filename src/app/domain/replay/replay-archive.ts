import { decodeReplayEvents, encodeReplayEvents, toManifest } from '@axe/domain/replay/replay-codec';
import type { ReplayEvent, ReplayManifest } from '@axe/domain/replay/replay-event';

export const REPLAY_ARCHIVE_EXTENSION = 'axe-replay.zip';
export const REPLAY_MANIFEST_NAME = 'manifest.json';
export const REPLAY_EVENT_DIR = 'events/';
export const REPLAY_KEYFRAME_DIR = 'keyframes/';
export const REPLAY_ASSET_DIR = 'assets/';

export interface ReplayArchiveEntry {
  name: string;
  blob: Blob;
}

export interface ReplayArchiveSource {
  manifest: ReplayManifest;
  chunks: readonly { index: number; events: readonly ReplayEvent[] }[];
  keyframes: readonly { seq: number; blob: Blob }[];
  assets: readonly File[];
}

export interface ReplayArchiveContent {
  manifest: ReplayManifest;
  events: ReplayEvent[];
  keyframes: { seq: number; blob: Blob }[];
  assets: File[];
}

/**
 * The file name a recording is saved under, without the extension: the room name and the local
 * date and minute it started.
 *
 * Characters a file name cannot hold become underscores, and a room with no name is called `replay`.
 */
export function replayArchiveName(manifest: Pick<ReplayManifest, 'roomName' | 'startedAt'>): string {
  const date = new Date(manifest.startedAt);
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  const room = manifest.roomName.replace(/[\\/:*?"<>|]/g, '_').trim();
  return `${room.length > 0 ? room : 'replay'}_${stamp}`;
}

/**
 * The files that go into a recording's zip, named by where they sit in it.
 *
 * The manifest is written as JSON, each chunk of events as MessagePack under `events/`, each
 * keyframe under `keyframes/`, and the pictures and sounds under `assets/`.
 */
export function buildReplayArchiveFiles(source: ReplayArchiveSource): File[] {
  const files: File[] = [
    new File([JSON.stringify(source.manifest, null, 2)], REPLAY_MANIFEST_NAME, { type: 'application/json' }),
  ];

  for (const chunk of source.chunks) {
    const bytes = encodeReplayEvents(chunk.events);
    files.push(
      new File([bytes as BlobPart], `${REPLAY_EVENT_DIR}${indexName(chunk.index)}.msgpack`, {
        type: 'application/octet-stream',
      })
    );
  }

  for (const keyframe of source.keyframes) {
    files.push(
      new File([keyframe.blob], `${REPLAY_KEYFRAME_DIR}${indexName(keyframe.seq)}.zip`, { type: 'application/zip' })
    );
  }

  for (const asset of source.assets) {
    files.push(new File([asset], `${REPLAY_ASSET_DIR}${asset.name}`, { type: asset.type }));
  }

  return files;
}

/**
 * Reads a recording back from the entries of its unpacked zip.
 *
 * Null when there is no manifest or it is not a supported format. The events of every chunk
 * come back as one list in sequence order, and the folders are found even when the zip wraps
 * them in an outer folder.
 */
export async function parseReplayArchive(entries: readonly ReplayArchiveEntry[]): Promise<ReplayArchiveContent | null> {
  const manifestEntry = entries.find((entry) => baseName(entry.name) === REPLAY_MANIFEST_NAME);
  if (!manifestEntry) return null;

  const manifest = parseManifest(await manifestEntry.blob.text());
  if (!manifest) return null;

  const events: ReplayEvent[] = [];
  for (const entry of sortedByName(entries.filter((entry) => isInDirectory(entry.name, REPLAY_EVENT_DIR)))) {
    events.push(...decodeReplayEvents(new Uint8Array(await entry.blob.arrayBuffer())));
  }
  events.sort((a, b) => a.seq - b.seq);

  const keyframes = sortedByName(entries.filter((entry) => isInDirectory(entry.name, REPLAY_KEYFRAME_DIR))).map(
    (entry) => ({ seq: seqOf(entry.name), blob: entry.blob })
  );

  const assets = entries
    .filter((entry) => isInDirectory(entry.name, REPLAY_ASSET_DIR))
    .map((entry) => new File([entry.blob], baseName(entry.name), { type: entry.blob.type }));

  return { manifest, events, keyframes, assets };
}

function parseManifest(text: string): ReplayManifest | null {
  try {
    return toManifest(JSON.parse(text));
  } catch {
    return null;
  }
}

function indexName(index: number): string {
  return String(index).padStart(6, '0');
}

function baseName(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index < 0 ? normalized : normalized.slice(index + 1);
}

function isInDirectory(name: string, directory: string): boolean {
  const segments = name
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');
  const at = segments.indexOf(directory.replace(/\/$/, ''));
  return at >= 0 && at === segments.length - 2;
}

function seqOf(name: string): number {
  const parsed = Number.parseInt(baseName(name), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortedByName(entries: readonly ReplayArchiveEntry[]): ReplayArchiveEntry[] {
  return [...entries].sort((a, b) => baseName(a.name).localeCompare(baseName(b.name)));
}
