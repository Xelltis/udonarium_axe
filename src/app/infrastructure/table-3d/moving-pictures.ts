import { isAnimatedImageBytes } from '@axe/core/storage/animated-image';
import { clamp } from '@axe/core/util/clamp';
import { LONGEST_PICTURE_PX } from '@axe/infrastructure/table-3d/table-3d-port';
import type { Texture } from 'three/webgpu';

/** One frame of a moving picture, to be drawn and let go of, and how long it stands, in milliseconds. */
export interface MovingFrame {
  readonly durationMs: number;
  draw(onto: CanvasRenderingContext2D, width: number, height: number): void;
  close(): void;
}

/** A moving picture read: how large it is, how many frames it has, how many times it plays them, and each frame. */
export interface MovingSource {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  /** How many times its frames are played through: Infinity for over and over. */
  readonly plays: number;
  frame(index: number): Promise<MovingFrame>;
  close(): void;
}

/** Reads the picture at a URL as a moving one, or answers null for one that stands still or cannot be read so. */
export type MovingReader = (url: string) => Promise<MovingSource | null>;

/**
 * How long a frame of a moving picture stands, in milliseconds, as browsers have it: one told to
 * stand for ten milliseconds or less stands for a tenth of a second, as GIFs made for old browsers
 * were drawn.
 */
export function frameStandsMs(toldMs: number): number {
  return toldMs <= 10 ? 100 : toldMs;
}

/** How far behind a moving picture may fall, in milliseconds, before it goes on from now rather than catching up. */
const CATCH_UP_MS = 1000;

/** What wears a moving picture: a texture wearing it as drawn, or one painted from each frame, as a coin's face. */
export interface PictureWearer {
  readonly texture: Texture;
  /** Paints the texture's own picture from a frame; where absent, the texture wears the frame itself. */
  readonly paint?: (frame: HTMLCanvasElement) => void;
}

/** A moving picture at a URL, read once for every texture wearing it: the frames and where it has got to. */
interface Moving {
  readonly wearers: Set<PictureWearer>;
  source: MovingSource | null;
  still: boolean;
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  index: number;
  played: number;
  /** When the next frame is due, in milliseconds; NaN for one standing its first frame, its time not yet counted. */
  nextAtMs: number;
  standsMs: number;
  drawing: boolean;
  drawn: boolean;
  done: boolean;
}

/**
 * Moves the moving pictures the table wears, APNG, GIF and moving WebP, which a texture read once
 * stands still on the first frame of: each is read once, frame by frame, and drawn on a canvas of its
 * own, no larger than a picture is drawn, which every texture wearing it wears, or is painted from.
 * Each frame stands as long as the picture tells, from the moment it was due, and a picture moves only
 * while something wearing it is in sight; out of sight it waits where it got to. It moves for as long
 * as anything wears it, after as many plays as it is made for. While pictures are not to move, as for
 * a reader who asks for less motion, each stands on its first frame. A browser that cannot read
 * pictures frame by frame leaves them as they are read, on their first frames.
 */
export class MovingPictures {
  private readonly moving = new Map<string, Moving>();
  private turning = true;
  private closed = false;

  constructor(
    private readonly drawn: () => void,
    private readonly read: MovingReader = readMoving
  ) {}

  /**
   * Moves the picture a texture wears, read from a URL, where it moves, until the texture is let go
   * of; nothing where it stands still.
   */
  follow(url: string, picture: Texture): void {
    const callOff = this.wear(url, { texture: picture });
    picture.addEventListener('dispose', callOff);
  }

  /**
   * Has a wearer wear the picture at a URL where it moves, and answers what calls the wearing off:
   * the picture is let go of once nothing wears it.
   */
  wear(url: string, wearer: PictureWearer): () => void {
    if (this.closed) return () => undefined;
    let moving = this.moving.get(url);
    if (!moving) {
      moving = {
        wearers: new Set(),
        source: null,
        still: false,
        canvas: null,
        context: null,
        index: 0,
        played: 0,
        nextAtMs: Number.NaN,
        standsMs: 0,
        drawing: false,
        drawn: false,
        done: false,
      };
      this.moving.set(url, moving);
      this.readInto(url, moving);
    }
    moving.wearers.add(wearer);
    if (moving.drawn && moving.canvas) this.dress(wearer, moving.canvas);
    const worn = moving;
    return () => {
      worn.wearers.delete(wearer);
      if (worn.wearers.size === 0 && this.moving.get(url) === worn) this.letGo(url);
    };
  }

  /** Lets pictures move, or stands each on its first frame where they are not to. */
  setTurning(turning: boolean): void {
    if (turning === this.turning) return;
    this.turning = turning;
    for (const moving of this.moving.values()) {
      if (!moving.source) continue;
      moving.played = 0;
      moving.done = false;
      moving.nextAtMs = Number.NaN;
      if (!turning) void this.draw(moving, 0, null);
    }
  }

  /**
   * Moves the pictures something in sight wears on to a moment, in milliseconds: each whose frame
   * has stood long enough is drawn on its next. Answers the moment the next frame of any of them is
   * due, or null where none moves in sight, and so none wants frames.
   */
  advance(timeMs: number, inSight: (picture: Texture) => boolean = () => true): number | null {
    if (!this.turning) return null;
    let due: number | null = null;
    const wants = (atMs: number) => (due = due === null ? atMs : Math.min(due, atMs));
    for (const moving of this.moving.values()) {
      if (!moving.source || moving.done || moving.drawing) continue;
      if (![...moving.wearers].some((wearer) => inSight(wearer.texture))) continue;
      if (Number.isNaN(moving.nextAtMs)) moving.nextAtMs = timeMs + moving.standsMs;
      if (timeMs < moving.nextAtMs) {
        wants(moving.nextAtMs);
        continue;
      }
      let next = moving.index + 1;
      if (next >= moving.source.frames) {
        moving.played++;
        if (moving.played >= moving.source.plays) {
          moving.done = true;
          continue;
        }
        next = 0;
      }
      const from = timeMs - moving.nextAtMs > CATCH_UP_MS ? timeMs : moving.nextAtMs;
      void this.draw(moving, next, from);
    }
    return due;
  }

  /** Lets go of every picture it moves, and reads no more. */
  dispose(): void {
    this.closed = true;
    for (const url of [...this.moving.keys()]) this.letGo(url);
  }

  /** How many pictures are being moved now, as the table counts what it holds. */
  get shown(): number {
    let count = 0;
    for (const moving of this.moving.values()) if (moving.source) count++;
    return count;
  }

  /** The textures wearing the pictures being moved, or painted from them. */
  worn(): Texture[] {
    const worn: Texture[] = [];
    for (const moving of this.moving.values()) {
      if (moving.source) for (const wearer of moving.wearers) worn.push(wearer.texture);
    }
    return worn;
  }

  /** Whether the picture a texture wears is being moved. */
  moves(picture: Texture): boolean {
    for (const moving of this.moving.values()) {
      if (moving.source && [...moving.wearers].some((wearer) => wearer.texture === picture)) return true;
    }
    return false;
  }

  private readInto(url: string, moving: Moving): void {
    void this.read(url).then(
      (source) => {
        if (this.moving.get(url) !== moving || this.closed) {
          source?.close();
          return;
        }
        if (!source || source.frames < 2) {
          source?.close();
          moving.still = true;
          return;
        }
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, LONGEST_PICTURE_PX / Math.max(1, source.width, source.height));
        canvas.width = clamp(Math.round(source.width * scale), 1, LONGEST_PICTURE_PX);
        canvas.height = clamp(Math.round(source.height * scale), 1, LONGEST_PICTURE_PX);
        moving.source = source;
        moving.canvas = canvas;
        moving.context = canvas.getContext('2d');
        void this.draw(moving, 0, null);
      },
      () => {
        if (this.moving.get(url) === moving) moving.still = true;
      }
    );
  }

  /** Draws a frame of a picture and has every wearer wear it; its time counted from a moment, or from the next advance for none. */
  private async draw(moving: Moving, index: number, fromMs: number | null): Promise<void> {
    const source = moving.source;
    const canvas = moving.canvas;
    if (!source || !canvas) return;
    moving.drawing = true;
    try {
      const frame = await source.frame(index);
      try {
        if (moving.source !== source) return;
        if (moving.context) {
          moving.context.clearRect(0, 0, canvas.width, canvas.height);
          frame.draw(moving.context, canvas.width, canvas.height);
        }
        moving.index = index;
        moving.standsMs = frameStandsMs(frame.durationMs);
        moving.nextAtMs = fromMs === null ? Number.NaN : fromMs + moving.standsMs;
        moving.drawn = true;
        for (const wearer of moving.wearers) this.dress(wearer, canvas);
        this.drawn();
      } finally {
        frame.close();
      }
    } catch {
      moving.done = true;
    } finally {
      moving.drawing = false;
    }
  }

  private dress(wearer: PictureWearer, canvas: HTMLCanvasElement): void {
    if (wearer.paint) wearer.paint(canvas);
    else if (wearer.texture.image !== canvas) wearer.texture.image = canvas;
    wearer.texture.needsUpdate = true;
  }

  private letGo(url: string): void {
    const moving = this.moving.get(url);
    if (!moving) return;
    this.moving.delete(url);
    moving.source?.close();
    moving.source = null;
  }
}

/**
 * Reads the picture at a URL frame by frame where it moves and the browser can (`ImageDecoder`):
 * null for one that stands still, one the browser cannot read so, or one that cannot be fetched.
 */
async function readMoving(url: string): Promise<MovingSource | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  const bytes = await movingBytesAt(url);
  if (!bytes) return null;
  const type = movingTypeOf(bytes);
  if (!type || !(await ImageDecoder.isTypeSupported(type))) return null;
  const decoder = new ImageDecoder({ data: bytes, type });
  const read = await firstOf(decoder).catch(() => null);
  if (!read) {
    decoder.close();
    return null;
  }
  const { track, width, height } = read;
  return {
    width,
    height,
    frames: track.frameCount,
    plays: track.repetitionCount === Infinity ? Infinity : track.repetitionCount + 1,
    frame: async (index) => {
      const image = (await decoder.decode({ frameIndex: index })).image;
      return {
        durationMs: (image.duration ?? 0) / 1000,
        draw: (onto, w, h) => onto.drawImage(image, 0, 0, w, h),
        close: () => image.close(),
      };
    },
    close: () => decoder.close(),
  };
}

/**
 * The track of a decoder's picture and the size of its first frame, where it has more than one frame;
 * null for one that stands still.
 */
async function firstOf(decoder: ImageDecoder): Promise<{ track: ImageTrack; width: number; height: number } | null> {
  await decoder.tracks.ready;
  await decoder.completed;
  const track = decoder.tracks.selectedTrack;
  if (!track || track.frameCount < 2) return null;
  const first = (await decoder.decode({ frameIndex: 0 })).image;
  const size = { track, width: first.displayWidth, height: first.displayHeight };
  first.close();
  return size;
}

/** How much of a picture is read to tell whether it moves, which each format says before its first pixels. */
const HEAD_BYTES = 64 * 1024;

/**
 * The bytes of the picture at a URL where it moves; null for one that stands still, of which no more
 * is read than its head, or one that cannot be fetched.
 */
async function movingBytesAt(url: string): Promise<ArrayBuffer | null> {
  const response = await fetch(url);
  const reader = response.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array[] = [];
  let length = 0;
  let told: boolean | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      parts.push(value);
      length += value.byteLength;
    }
    if (told === null && (done || length >= HEAD_BYTES)) {
      told = isAnimatedImageBytes(joined(parts, length).buffer as ArrayBuffer);
      if (!told) {
        await reader.cancel();
        return null;
      }
    }
    if (done) break;
  }
  return joined(parts, length).buffer as ArrayBuffer;
}

function joined(parts: readonly Uint8Array[], length: number): Uint8Array {
  const all = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return all;
}

/** The type a moving picture is read as, by its head: PNG, GIF or WebP. */
function movingTypeOf(bytes: ArrayBuffer): string | null {
  const head = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
  const ascii = (from: number, length: number) => String.fromCharCode(...head.slice(from, from + length));
  if (head[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (ascii(0, 3) === 'GIF') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  return null;
}
