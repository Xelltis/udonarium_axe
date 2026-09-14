import { Logger } from '@axe/core/logging/logger';
import type { EncodedAudio, EncodedVideo, VideoEncodeRequest } from '@axe/core/media/video-encoder';

/**
 * Exporting for a browser without WebCodecs.
 *
 * The canvas and the mixed audio go straight into `MediaRecorder`. The browser encodes, so
 * frames cannot be pushed faster than real time and the export **takes as long as the video**. Still better than no export.
 */

const CANDIDATE_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

/** Whether MediaRecorder can export here in real time, the fallback when WebCodecs is missing. */
export function isMediaRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

/** The container this browser accepts, or null when none is known. */
export function mediaRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return CANDIDATE_TYPES[CANDIDATE_TYPES.length - 1];

  for (const type of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/** The file extension for a recorded MIME type: mp4 for any video/mp4 type, webm for the rest. */
export function extensionOfMediaType(type: string): string {
  return type.startsWith('video/mp4') ? 'mp4' : 'webm';
}

interface SoundTrack {
  stream: MediaStream;
  start(): void;
  stop(): void;
}

function soundTrackOf(audio: EncodedAudio | null | undefined): SoundTrack | null {
  if (!audio || audio.channels.length < 1 || typeof AudioContext === 'undefined') return null;

  try {
    const context = new AudioContext({ sampleRate: audio.sampleRate });
    const buffer = context.createBuffer(audio.channels.length, audio.channels[0].length, audio.sampleRate);
    for (const [index, samples] of audio.channels.entries()) buffer.copyToChannel(new Float32Array(samples), index);

    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);

    return {
      stream: destination.stream,
      start: () => source.start(),
      stop: () => {
        source.stop();
        void context.close();
      },
    };
  } catch (reason) {
    Logger.warn('[MediaRecorder] 音を用意できませんでした', reason);
    return null;
  }
}

/** Draws and records in real time. Frame numbers come from the clock, so falling behind never desynchronises picture and sound. */
export async function recordVideo(request: VideoEncodeRequest): Promise<EncodedVideo | null> {
  const type = mediaRecordingType();
  if (!isMediaRecordingSupported() || !type) {
    Logger.warn('[MediaRecorder] この環境では動画を書き出せません');
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = request.width;
  canvas.height = request.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const stream = canvas.captureStream(request.fps);
  const sound = soundTrackOf(request.audio);
  for (const track of sound?.stream.getAudioTracks() ?? []) stream.addTrack(track);

  const parts: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: type });
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) parts.push(event.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const durationMs = (request.frameCount / request.fps) * 1000;
  const msPerFrame = 1000 / request.fps;

  try {
    recorder.start();
    sound?.start();

    const startedAt = performance.now();
    let painted = -1;
    for (;;) {
      if (request.isCancelled?.()) {
        recorder.stop();
        await stopped;
        return null;
      }

      const elapsed = performance.now() - startedAt;
      if (elapsed >= durationMs) break;

      const index = Math.min(request.frameCount - 1, Math.floor(elapsed / msPerFrame));
      if (index !== painted) {
        painted = index;
        await request.paint(ctx as unknown as OffscreenCanvasRenderingContext2D, index);
        request.onProgress?.(index + 1, request.frameCount);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, msPerFrame / 2)));
    }

    request.onProgress?.(request.frameCount, request.frameCount);
    recorder.stop();
    await stopped;
    return { blob: new Blob(parts, { type }), extension: extensionOfMediaType(type) };
  } catch (reason) {
    Logger.warn('[MediaRecorder] 書き出しに失敗しました', reason);
    return null;
  } finally {
    sound?.stop();
    for (const track of stream.getTracks()) track.stop();
  }
}
