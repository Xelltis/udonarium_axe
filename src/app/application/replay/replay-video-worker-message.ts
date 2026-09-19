import type { ReplayVideoShared } from '@axe/application/replay/replay-video-production';

/** A video for the worker to draw and encode: what it is made of, and how it is written. */
export interface ReplayVideoWorkerJob {
  shared: ReplayVideoShared;
  fps: number;
  frameCount: number;
  /** The shape of the sound, which the worker asks the page for a stretch at a time. Null for none. */
  sound: { sampleRate: number; numberOfChannels: number; length: number } | null;
  /** Where to write the file, when there is somewhere; the worker writes to it itself. */
  file: FileSystemFileHandle | null;
  /** Where the app is served from, for the fonts and bundled pictures. */
  baseUrl: string;
}

/** What the page tells the worker. */
export type ReplayVideoWorkerRequest =
  | { kind: 'start'; job: ReplayVideoWorkerJob }
  | { kind: 'cancel' }
  | { kind: 'image'; id: number; blob: Blob | null; url: string; found: boolean }
  | { kind: 'sound'; id: number; channels: Float32Array[] };

/** What the worker tells the page. */
export type ReplayVideoWorkerResponse =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'image-request'; id: number; identifier: string }
  | { kind: 'sound-request'; id: number; start: number; count: number }
  | { kind: 'done'; blob: Blob | null; extension: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };
