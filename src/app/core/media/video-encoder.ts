import { Logger } from '@axe/core/logging/logger';
import { isMediaRecordingSupported, recordVideo } from '@axe/core/media/media-recorder-encoder';
import { downloadBlob } from '@axe/core/util/download-blob';

export type VideoPaintTarget = OffscreenCanvasRenderingContext2D;

/**
 * The sound of a video, handed over a stretch at a time, so a long one is never held whole in
 * memory.
 */
export interface VideoSoundSource {
  sampleRate: number;
  numberOfChannels: number;
  /** How many frames of sound there are in all. */
  length: number;
  /** The frames from `start`, `count` of them or as many as are left, one array to each channel. */
  read(start: number, count: number): Promise<Float32Array[]>;
}

/** A sound already whole in memory, handed over a stretch at a time like any other. */
export function soundOfChannels(sampleRate: number, channels: readonly Float32Array[]): VideoSoundSource {
  const length = channels[0]?.length ?? 0;
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length,
    read: async (start, count) => channels.map((samples) => samples.subarray(start, Math.min(length, start + count))),
  };
}

export interface VideoEncodeRequest {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  bitrate?: number;
  audio?: VideoSoundSource | null;
  /** Where to write. Given one, the bytes go straight there rather than through memory. */
  file?: FileSystemFileHandle | null;
  paint(ctx: VideoPaintTarget, frameIndex: number): void | Promise<void>;
  onProgress?(done: number, total: number): void;
  isCancelled?(): boolean;
}

export interface EncodedVideo {
  /** Null when a destination was given: the file has already been written. */
  blob: Blob | null;
  extension: string;
}

/** A keyframe every two seconds, as YouTube asks of an upload. */
export const VIDEO_KEYFRAME_SECONDS = 2;
/**
 * Past this, the index-first form is abandoned for streaming.
 * Putting the index first means holding the whole file in memory, which caps the length.
 */
export const VIDEO_INLINE_INDEX_BUDGET_BYTES = 512 * 1024 * 1024;
export const VIDEO_ENCODE_QUEUE_LIMIT = 8;
export const AUDIO_FRAME_SAMPLES = 1024;
export const AUDIO_BITRATE = 192_000;

/** Whether this browser has the WebCodecs video encoder and OffscreenCanvas for a fast export. */
export function isVideoEncodingSupported(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
  );
}

/** Whether this browser has the WebCodecs audio encoder; without it a fast export has no sound. */
export function isAudioEncodingSupported(): boolean {
  return typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined';
}

/** Whichever of aac and opus this browser can encode, or null for neither. */
export async function audioCodecFor(
  sound: VideoSoundSource
): Promise<{ codec: 'aac' | 'opus'; webCodec: string } | null> {
  if (!isAudioEncodingSupported()) return null;
  // With nothing to ask, there is no way to find out, so aac is tried as before.
  if (typeof AudioEncoder.isConfigSupported !== 'function') return { codec: 'aac', webCodec: 'mp4a.40.2' };

  const candidates = [
    { codec: 'aac', webCodec: 'mp4a.40.2' },
    { codec: 'opus', webCodec: 'opus' },
  ] as const;
  for (const candidate of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: candidate.webCodec,
        numberOfChannels: sound.numberOfChannels,
        sampleRate: sound.sampleRate,
        bitrate: AUDIO_BITRATE,
      });
      if (support.supported) return { ...candidate };
    } catch {
      continue;
    }
  }
  return null;
}

/** How many frames apart keyframes come at a frame rate. */
export function keyframeIntervalFor(fps: number): number {
  return Math.max(1, Math.round(fps * VIDEO_KEYFRAME_SECONDS));
}

/**
 * The bitrate in bits per second when a request names none: what YouTube recommends for an upload
 * of that size and rate, with room to spare for the sharp edges of text, and half as much again
 * for 60 frames a second.
 */
export function defaultVideoBitrate(width: number, height: number, fps: number): number {
  const pixels = width * height;
  const base =
    pixels <= 1280 * 720
      ? 6_000_000
      : pixels <= 1920 * 1080
        ? 10_000_000
        : pixels <= 2560 * 1440
          ? 20_000_000
          : 45_000_000;
  return Math.round(fps > 30 ? base * 1.5 : base);
}

/** The H.264 levels, each with the macroblocks it decodes a second and the most a frame may have. */
const AVC_LEVELS: readonly (readonly [level: number, perSecond: number, perFrame: number])[] = [
  [0x1f, 108_000, 3_600],
  [0x20, 216_000, 5_120],
  [0x28, 245_760, 8_192],
  [0x2a, 522_240, 8_704],
  [0x32, 589_824, 22_080],
  [0x33, 983_040, 36_864],
  [0x34, 2_073_600, 36_864],
];

/**
 * The H.264 High profile codec with the lowest level that carries the frame at its rate: 3.1 for
 * 720p30, 4.0 for 1080p30, 4.2 for 1080p60, 5.1 for 1440p60 and 2160p30, 5.2 for 2160p60. A player
 * refuses a stream whose level claims less than it needs.
 */
export function avcCodecFor(width: number, height: number, fps = 30): string {
  const perFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const perSecond = perFrame * fps;
  const fits = AVC_LEVELS.find(([, rate, size]) => perFrame <= size && perSecond <= rate);
  const level = (fits ?? AVC_LEVELS[AVC_LEVELS.length - 1])[0];
  return `avc1.6400${level.toString(16).padStart(2, '0')}`;
}

export class VideoEncoderGateway {
  private static _instance: VideoEncoderGateway;
  /** The gateway shared by the whole app, created on first use. */
  static get instance(): VideoEncoderGateway {
    if (!VideoEncoderGateway._instance) VideoEncoderGateway._instance = new VideoEncoderGateway();
    return VideoEncoderGateway._instance;
  }

  /** Whether this browser can export video at all, with WebCodecs or by recording in real time. */
  get isSupported(): boolean {
    return isVideoEncodingSupported() || isMediaRecordingSupported();
  }

  /** A browser without WebCodecs falls back to recording in real time. */
  get isRealtimeOnly(): boolean {
    return !isVideoEncodingSupported() && isMediaRecordingSupported();
  }

  /**
   * Exports a video with WebCodecs when available and by recording in real time otherwise.
   *
   * Null when the export fails or is cancelled.
   */
  encode(request: VideoEncodeRequest): Promise<EncodedVideo | null> {
    return isVideoEncodingSupported() ? encodeVideo(request) : recordVideo(request);
  }

  /** Downloads an exported video, skipping a null blob, which was already written to a file. */
  save(blob: Blob | null, fileName: string): void {
    // Where a destination was given, the file is already written.
    if (blob) downloadBlob(blob, fileName);
  }
}

/**
 * Encodes the frames and sound of a request into an MP4 with WebCodecs, faster than real time.
 *
 * A short video is built in memory with its index first. A long one, or any given a destination
 * file, is written in fragmented form, straight to that file when there is one, and the blob comes
 * back null. Null overall when WebCodecs is missing, encoding fails or the request is cancelled.
 */
export async function encodeVideo(request: VideoEncodeRequest): Promise<EncodedVideo | null> {
  if (!isVideoEncodingSupported()) {
    Logger.warn('[VideoEncoder] この環境では動画を書き出せません');
    return null;
  }

  const ctx = new OffscreenCanvas(request.width, request.height).getContext('2d');
  if (!ctx) return null;

  const { ArrayBufferTarget, FileSystemWritableFileStreamTarget, Muxer, StreamTarget } = await import('mp4-muxer');
  const sound = request.audio && request.audio.numberOfChannels > 0 && request.audio.length > 0 ? request.audio : null;
  const soundCodec = sound ? await audioCodecFor(sound) : null;
  const bitrate = request.bitrate ?? defaultVideoBitrate(request.width, request.height, request.fps);

  // A long video cannot carry its index first, since that means holding all of it in memory,
  // so the streaming form takes over. Given a destination, the bytes go straight to disk.
  const estimatedBytes = ((bitrate + AUDIO_BITRATE) / 8) * (request.frameCount / request.fps);
  const streaming = request.file != null || estimatedBytes > VIDEO_INLINE_INDEX_BUDGET_BYTES;

  const microsPerFrame = 1_000_000 / request.fps;
  const keyframeEvery = keyframeIntervalFor(request.fps);
  let failure: unknown = null;
  let writable: FileSystemWritableFileStream | null = null;
  let opened: VideoEncoder | null = null;
  let audio: ReturnType<typeof soundPump> | null = null;
  try {
    writable = request.file ? await request.file.createWritable() : null;
    const parts: BlobPart[] = [];
    const target = writable
      ? new FileSystemWritableFileStreamTarget(writable)
      : streaming
        ? new StreamTarget({ onData: (data) => parts.push(data.slice()), chunked: true })
        : new ArrayBufferTarget();

    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: request.width, height: request.height, frameRate: request.fps },
      audio:
        sound && soundCodec
          ? { codec: soundCodec.codec, numberOfChannels: sound.numberOfChannels, sampleRate: sound.sampleRate }
          : undefined,
      fastStart: streaming ? 'fragmented' : 'in-memory',
    });

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (reason) => {
        failure = reason;
      },
    });
    opened = encoder;
    audio = sound && soundCodec ? soundPump(muxer, sound, soundCodec.webCodec) : null;

    if (!(await configureVideo(encoder, request, bitrate))) throw new Error('この形式では書き出せません');

    for (let index = 0; index < request.frameCount; index += 1) {
      if (request.isCancelled?.()) {
        if (writable) await writable.abort().catch(() => undefined);
        return null;
      }
      if (failure) throw failure;

      await request.paint(ctx, index);
      const frame = new VideoFrame(ctx.canvas, {
        timestamp: Math.round(index * microsPerFrame),
        duration: Math.round(microsPerFrame),
      });
      encoder.encode(frame, { keyFrame: index % keyframeEvery === 0 });
      frame.close();

      if (encoder.encodeQueueSize > VIDEO_ENCODE_QUEUE_LIMIT) await drain(encoder);
      if (audio) await audio.until((index + 1) * microsPerFrame);
      request.onProgress?.(index + 1, request.frameCount);
    }

    await encoder.flush();
    if (failure) throw failure;
    if (audio) await audio.finish();
    if (request.isCancelled?.()) {
      if (writable) await writable.abort().catch(() => undefined);
      return null;
    }
    muxer.finalize();
    if (writable) {
      await writable.close();
      return { blob: null, extension: 'mp4' };
    }
    const body: BlobPart[] = target instanceof ArrayBufferTarget ? [target.buffer as BlobPart] : parts;
    return { blob: new Blob(body, { type: 'video/mp4' }), extension: 'mp4' };
  } catch (reason) {
    Logger.warn('[VideoEncoder] 書き出しに失敗しました', reason);
    if (writable) await writable.abort().catch(() => undefined);
    return null;
  } finally {
    if (opened && opened.state !== 'closed') opened.close();
    audio?.close();
  }
}

/**
 * Sets the encoder up for the best picture the browser will make: a variable bitrate tuned for
 * quality over speed, falling back a step at a time to the plainest settings. False when the
 * browser will take none of them.
 */
async function configureVideo(encoder: VideoEncoder, request: VideoEncodeRequest, bitrate: number): Promise<boolean> {
  const plain: VideoEncoderConfig = {
    codec: avcCodecFor(request.width, request.height, request.fps),
    width: request.width,
    height: request.height,
    framerate: request.fps,
    bitrate,
  };
  const candidates: VideoEncoderConfig[] = [
    { ...plain, bitrateMode: 'variable', latencyMode: 'quality' },
    { ...plain, bitrateMode: 'variable' },
    plain,
  ];
  if (typeof VideoEncoder.isConfigSupported !== 'function') {
    encoder.configure(candidates[0]);
    return true;
  }
  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported(candidate);
      if (!support.supported) continue;
      encoder.configure(support.config ?? candidate);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function drain(encoder: VideoEncoder): Promise<void> {
  while (encoder.encodeQueueSize > VIDEO_ENCODE_QUEUE_LIMIT / 2) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** How much sound is read from the source at a time: five seconds at 48 kHz. */
export const SOUND_READ_FRAMES = 240_000;

/**
 * Encodes the sound a stretch at a time as the picture goes, so the two travel through the file
 * together and neither waits in memory for the other. The sound is read from its source a few
 * seconds at a time as it is needed. Only whole frames of sound are encoded along the way; the last,
 * shorter one goes when the picture is done.
 */
function soundPump(
  muxer: { addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void },
  sound: VideoSoundSource,
  webCodec: string
) {
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (reason) => {
      failure = reason;
    },
  });
  encoder.configure({
    codec: webCodec,
    numberOfChannels: sound.numberOfChannels,
    sampleRate: sound.sampleRate,
    bitrate: AUDIO_BITRATE,
  });

  const total = sound.length;
  const channels = sound.numberOfChannels;
  const planar = new Float32Array(AUDIO_FRAME_SAMPLES * channels);
  let offset = 0;
  let held: { start: number; samples: Float32Array[] } = { start: 0, samples: [] };

  const heldLength = () => held.samples[0]?.length ?? 0;
  const ensure = async (upto: number): Promise<void> => {
    if (upto <= held.start + heldLength()) return;
    const start = offset;
    const samples = await sound.read(start, Math.max(SOUND_READ_FRAMES, upto - start));
    held = { start, samples };
  };

  const encodeNext = async (count: number): Promise<void> => {
    await ensure(offset + count);
    const from = offset - held.start;
    for (let channel = 0; channel < channels; channel += 1) {
      const samples = held.samples[channel] ?? new Float32Array(0);
      const part = samples.subarray(from, from + count);
      planar.fill(0, channel * count, (channel + 1) * count);
      planar.set(part, channel * count);
    }
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: sound.sampleRate,
      numberOfFrames: count,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sound.sampleRate) * 1_000_000),
      data: planar.subarray(0, count * channels),
    });
    encoder.encode(data);
    data.close();
    offset += count;
  };

  return {
    /** Encodes every whole frame of sound up to a moment of the picture, in microseconds. */
    async until(micros: number): Promise<void> {
      const upto = Math.min(total, Math.floor((micros / 1_000_000) * sound.sampleRate));
      while (offset + AUDIO_FRAME_SAMPLES <= upto) {
        if (failure) throw failure;
        await encodeNext(AUDIO_FRAME_SAMPLES);
        if (encoder.encodeQueueSize > VIDEO_ENCODE_QUEUE_LIMIT) await drainAudio(encoder);
      }
    },
    /** Encodes what is left and waits for all of it. */
    async finish(): Promise<void> {
      while (offset < total) {
        if (failure) throw failure;
        await encodeNext(Math.min(AUDIO_FRAME_SAMPLES, total - offset));
        if (encoder.encodeQueueSize > VIDEO_ENCODE_QUEUE_LIMIT) await drainAudio(encoder);
      }
      await encoder.flush();
      if (failure) throw failure;
    },
    close(): void {
      if (encoder.state !== 'closed') encoder.close();
    },
  };
}

async function drainAudio(encoder: AudioEncoder): Promise<void> {
  while (encoder.encodeQueueSize > VIDEO_ENCODE_QUEUE_LIMIT / 2) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
