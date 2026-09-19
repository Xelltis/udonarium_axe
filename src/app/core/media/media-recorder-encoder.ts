import { Logger } from '@axe/core/logging/logger';
import type { EncodedVideo, VideoEncodeRequest, VideoSoundSource } from '@axe/core/media/video-encoder';

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

/** How far ahead of the clock the sound is kept queued, in seconds. */
const SOUND_AHEAD_SECONDS = 6;
/** How much sound is queued at a time, in seconds. */
const SOUND_STRETCH_SECONDS = 3;

/**
 * The sound played into the recording as it runs, a few seconds at a time and a few seconds ahead,
 * so a long one is never held whole in memory.
 */
function soundTrackOf(audio: VideoSoundSource | null | undefined): SoundTrack | null {
  if (!audio || audio.numberOfChannels < 1 || audio.length < 1 || typeof AudioContext === 'undefined') return null;

  try {
    const context = new AudioContext({ sampleRate: audio.sampleRate });
    const destination = context.createMediaStreamDestination();
    const stretch = Math.round(SOUND_STRETCH_SECONDS * audio.sampleRate);
    const sources: AudioBufferSourceNode[] = [];
    let queued = 0;
    let startedAt = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    let topping = false;

    const topUp = async (): Promise<void> => {
      if (topping) return;
      topping = true;
      try {
        while (
          queued < audio.length &&
          queued / audio.sampleRate < context.currentTime - startedAt + SOUND_AHEAD_SECONDS
        ) {
          const channels = await audio.read(queued, stretch);
          const frames = channels[0]?.length ?? 0;
          if (frames < 1) break;
          const buffer = context.createBuffer(audio.numberOfChannels, frames, audio.sampleRate);
          channels.forEach((samples, index) => buffer.copyToChannel(new Float32Array(samples), index));
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(destination);
          source.start(startedAt + queued / audio.sampleRate);
          sources.push(source);
          queued += frames;
        }
      } catch (reason) {
        Logger.warn('[MediaRecorder] 音を読めませんでした', reason);
      } finally {
        topping = false;
      }
    };

    return {
      stream: destination.stream,
      start: () => {
        startedAt = context.currentTime + 0.1;
        void topUp();
        timer = setInterval(() => void topUp(), 1000);
      },
      stop: () => {
        if (timer) clearInterval(timer);
        for (const source of sources) source.stop();
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
