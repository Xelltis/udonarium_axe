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

/** The shortest a frame of a moving picture stands, in milliseconds, as browsers draw a frame told to stand for none. */
const SHORTEST_FRAME_MS = 20;

/** A picture being moved: the texture that wears it, the canvas it is drawn on, and where it has got to. */
interface Moving {
  readonly picture: Texture;
  readonly source: MovingSource;
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D | null;
  index: number;
  played: number;
  nextAtMs: number;
  drawing: boolean;
  done: boolean;
}

/**
 * Moves the moving pictures the table wears, APNG, GIF and moving WebP, which a texture read once
 * stands still on the first frame of: each is read frame by frame and drawn on a canvas of its own,
 * no larger than a picture is drawn, which the texture then wears, for every sprite and face wearing
 * it. A picture moves for as long as its texture is worn, and stops with it, after as many plays as
 * it is made for. While pictures are not to move, as for a reader who asks for less motion, each
 * stands on its first frame. A browser that cannot read pictures frame by frame leaves them as they
 * are read, on their first frames.
 */
export class MovingPictures {
  private readonly moving = new Map<Texture, Moving>();
  private turning = true;

  constructor(
    private readonly drawn: () => void,
    private readonly read: MovingReader = readMoving
  ) {}

  /** Moves the picture a texture wears, read from a URL, where it moves; nothing where it stands still. */
  follow(url: string, picture: Texture): void {
    void this.read(url).then(
      (source) => {
        if (!source) return;
        if (source.frames < 2 || this.moving.has(picture)) {
          source.close();
          return;
        }
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, LONGEST_PICTURE_PX / Math.max(1, source.width, source.height));
        canvas.width = clamp(Math.round(source.width * scale), 1, LONGEST_PICTURE_PX);
        canvas.height = clamp(Math.round(source.height * scale), 1, LONGEST_PICTURE_PX);
        const moving: Moving = {
          picture,
          source,
          canvas,
          context: canvas.getContext('2d'),
          index: 0,
          played: 0,
          nextAtMs: 0,
          drawing: false,
          done: false,
        };
        this.moving.set(picture, moving);
        picture.addEventListener('dispose', () => this.letGo(picture));
        void this.draw(moving, 0, 0);
      },
      () => undefined
    );
  }

  /** Lets pictures move, or stands each on its first frame where they are not to. */
  setTurning(turning: boolean): void {
    if (turning === this.turning) return;
    this.turning = turning;
    for (const moving of this.moving.values()) {
      moving.played = 0;
      moving.done = false;
      if (!turning) void this.draw(moving, 0, 0);
    }
  }

  /**
   * Moves the pictures on to a moment, in milliseconds: each whose frame has stood long enough is
   * drawn on its next. Answers whether any picture is still moving, and so wants frames.
   */
  advance(timeMs: number): boolean {
    if (!this.turning) return false;
    let any = false;
    for (const moving of this.moving.values()) {
      if (moving.done) continue;
      if (moving.drawing || timeMs < moving.nextAtMs) {
        any = true;
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
      any = true;
      void this.draw(moving, next, timeMs);
    }
    return any;
  }

  /** Lets go of every picture it moves. */
  dispose(): void {
    for (const picture of [...this.moving.keys()]) this.letGo(picture);
  }

  /** How many pictures are being moved now, as the table counts what it holds. */
  get shown(): number {
    return this.moving.size;
  }

  /** Whether the picture a texture wears is being moved. */
  moves(picture: Texture): boolean {
    return this.moving.has(picture);
  }

  private async draw(moving: Moving, index: number, timeMs: number): Promise<void> {
    moving.drawing = true;
    try {
      const frame = await moving.source.frame(index);
      if (!this.moving.has(moving.picture)) {
        frame.close();
        return;
      }
      if (moving.context) {
        moving.context.clearRect(0, 0, moving.canvas.width, moving.canvas.height);
        frame.draw(moving.context, moving.canvas.width, moving.canvas.height);
      }
      frame.close();
      moving.index = index;
      moving.nextAtMs = timeMs + Math.max(SHORTEST_FRAME_MS, frame.durationMs);
      if (moving.picture.image !== moving.canvas) moving.picture.image = moving.canvas;
      moving.picture.needsUpdate = true;
      this.drawn();
    } catch {
      moving.done = true;
    } finally {
      moving.drawing = false;
    }
  }

  private letGo(picture: Texture): void {
    const moving = this.moving.get(picture);
    if (!moving) return;
    this.moving.delete(picture);
    moving.source.close();
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
  await decoder.tracks.ready;
  await decoder.completed;
  const track = decoder.tracks.selectedTrack;
  if (!track) {
    decoder.close();
    return null;
  }
  const first = (await decoder.decode({ frameIndex: 0 })).image;
  const [width, height] = [first.displayWidth, first.displayHeight];
  first.close();
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
