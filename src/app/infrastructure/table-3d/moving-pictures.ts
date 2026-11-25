import { animationOfHead } from '@axe/core/storage/animated-image';
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

/** How many times a picture that could not be read is read, and how long it waits between, in milliseconds. */
const READ_TRIES = 3;
const READ_AGAIN_MS = 5000;

/**
 * How a wearer wears a moving picture: whether the table tells if it is in sight (see `see`), and
 * whether it throws a shadow cut to the picture, as a standing piece's board or a face of a block
 * does. A wearer the table does not tell of, as the painted ground or the water, is always in sight.
 */
export interface PictureWearer {
  readonly texture: Texture;
  /** Paints the texture's own picture from a frame; where absent, the texture wears the frame itself. */
  readonly paint?: (frame: HTMLCanvasElement) => void;
  /** Whether the table can tell if the wearer is in sight (see {@link MovingPictures.see}); always in sight where not. */
  readonly judged?: boolean;
  /**
   * Whether a shadow is cut to the picture the wearer wears, to be drawn again as its frame changes:
   * asked as each frame is drawn where it changes, as whether a piece stands to throw one.
   */
  readonly shadows?: boolean | (() => boolean);
}

/** A moving picture at a URL, read once for every texture wearing it: the frames and where it has got to. */
interface Moving {
  readonly wearers: Set<PictureWearer>;
  source: MovingSource | null;
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  index: number;
  played: number;
  /** When the next frame is due, in milliseconds; NaN for one standing its first frame, its time not yet counted. */
  nextAtMs: number;
  standsMs: number;
  /** The moment it went out of sight, its clock stopped there; null while in sight. */
  heldAtMs: number | null;
  /** Whether it could not be read, to be read again a while later or as the next wearer comes while tries remain, for every one wearing it. */
  failed: boolean;
  /** How many times it has been read. */
  tries: number;
  /** The wait before it is read again, where one is set. */
  again: ReturnType<typeof setTimeout> | null;
  drawing: boolean;
  drawn: boolean;
  done: boolean;
}

/**
 * Moves the moving pictures the table wears, APNG, GIF and moving WebP, which a texture read once
 * stands still on the first frame of: each is read once, frame by frame, and drawn on a canvas of its
 * own, no larger than a picture is drawn, which every texture wearing it wears, or is painted from.
 *
 * Each frame stands as long as the picture tells, from the moment it was due, and is drawn on the
 * frame of the screen that comes within `slackMs` of it; one fallen a whole frame behind goes on
 * from now rather than catching up. A picture moves only while something wearing
 * it is in sight, as the table last told after drawing (see {@link see}); out of sight its clock stops
 * where it got to and goes on from there. It moves for as long as anything wears it, after as many
 * plays as it is made for. While pictures are not to move, as for a reader who asks for less motion,
 * each stands on its first frame. A browser that cannot read pictures frame by frame leaves them as
 * they are read, on their first frames.
 */
export class MovingPictures {
  private readonly moving = new Map<string, Moving>();
  private seen: ReadonlySet<Texture> = new Set();
  private turning = true;
  private closed = false;

  /**
   * @param drawn told each time a frame is drawn, and whether a shadow cut to it is to be drawn again
   * @param slackMs how early a frame of the screen may draw a frame due a little after it
   */
  constructor(
    private readonly drawn: (shadows: boolean) => void,
    private readonly read: MovingReader = readMoving,
    private readonly slackMs = 0
  ) {}

  /**
   * Moves the picture a texture wears, read from a URL, where it moves, until the texture is let go
   * of; nothing where it stands still. How it is worn is told as for {@link wear}.
   */
  follow(url: string, picture: Texture, how: Omit<PictureWearer, 'texture' | 'paint'> = {}): void {
    const callOff = this.wear(url, { ...how, texture: picture });
    picture.addEventListener('dispose', callOff);
  }

  /**
   * Has a wearer wear the picture at a URL where it moves, and answers what calls the wearing off:
   * the picture is let go of once nothing wears it. A picture that could not be read is read again a
   * while later, and as the next wearer comes, no more than a few times in all, for every wearer it
   * had as well.
   */
  wear(url: string, wearer: PictureWearer): () => void {
    if (this.closed) return () => undefined;
    let moving = this.moving.get(url);
    if (!moving) {
      moving = {
        wearers: new Set(),
        source: null,
        canvas: null,
        context: null,
        index: 0,
        played: 0,
        nextAtMs: Number.NaN,
        standsMs: 0,
        heldAtMs: null,
        failed: false,
        tries: 0,
        again: null,
        drawing: false,
        drawn: false,
        done: false,
      };
      this.moving.set(url, moving);
      this.readInto(url, moving);
    } else if (moving.failed && moving.tries < READ_TRIES) {
      this.readAgain(url, moving);
    }
    moving.wearers.add(wearer);
    if (moving.drawn && moving.canvas) this.dress(wearer, moving.canvas);
    const worn = moving;
    return () => {
      worn.wearers.delete(wearer);
      if (worn.wearers.size === 0 && this.moving.get(url) === worn) this.letGo(url);
    };
  }

  /**
   * Has a texture wear the frame its moving picture stands on again, as after its still picture has
   * come and been put on it; nothing for a texture wearing no moving picture.
   */
  redress(picture: Texture): void {
    for (const moving of this.moving.values()) {
      if (!moving.drawn || !moving.canvas) continue;
      for (const wearer of moving.wearers) if (wearer.texture === picture) this.dress(wearer, moving.canvas);
    }
  }

  /** The textures the table is to tell of whether they are in sight: those wearing a moving picture where it can tell. */
  judged(): Set<Texture> {
    const judged = new Set<Texture>();
    for (const moving of this.moving.values()) {
      if (!moving.source) continue;
      for (const wearer of moving.wearers) if (wearer.judged) judged.add(wearer.texture);
    }
    return judged;
  }

  /**
   * Takes the textures the table found in sight as it drew; answers whether a picture is in sight now
   * that was not, so the table draws again for it.
   */
  see(inSight: ReadonlySet<Texture>): boolean {
    const before = [...this.moving.values()].map((moving) => this.inSight(moving));
    this.seen = inSight;
    return [...this.moving.values()].some((moving, index) => !before[index] && this.inSight(moving));
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
      moving.heldAtMs = null;
      if (!turning) void this.draw(moving, 0, null);
    }
  }

  /**
   * Moves the pictures in sight on to a moment, in milliseconds: each whose frame has stood long
   * enough is drawn on its next. Answers the moment the next frame of any of them is due, or null
   * where none moves in sight, and so none wants frames.
   */
  advance(timeMs: number): number | null {
    if (!this.turning) return null;
    let due: number | null = null;
    const wants = (atMs: number) => (due = due === null ? atMs : Math.min(due, atMs));
    for (const moving of this.moving.values()) {
      if (!moving.source || moving.done || moving.drawing) continue;
      if (!this.inSight(moving)) {
        moving.heldAtMs ??= timeMs;
        continue;
      }
      if (moving.heldAtMs !== null) {
        moving.nextAtMs += timeMs - moving.heldAtMs;
        moving.heldAtMs = null;
      }
      if (Number.isNaN(moving.nextAtMs)) moving.nextAtMs = timeMs + moving.standsMs;
      if (timeMs + this.slackMs < moving.nextAtMs) {
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
      const from = timeMs - moving.nextAtMs > moving.standsMs ? timeMs : moving.nextAtMs;
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

  /** Whether anything wearing a picture is in sight: a wearer the table cannot tell of always is. */
  private inSight(moving: Moving): boolean {
    for (const wearer of moving.wearers) if (!wearer.judged || this.seen.has(wearer.texture)) return true;
    return false;
  }

  private readInto(url: string, moving: Moving): void {
    moving.tries++;
    void this.read(url).then(
      (source) => {
        if (this.moving.get(url) !== moving || this.closed) {
          source?.close();
          return;
        }
        if (!source || source.frames < 2) {
          source?.close();
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
        if (this.moving.get(url) !== moving || this.closed) return;
        moving.failed = true;
        if (moving.tries >= READ_TRIES) return;
        moving.again = setTimeout(() => {
          moving.again = null;
          if (this.moving.get(url) === moving && moving.failed && !this.closed) this.readAgain(url, moving);
        }, READ_AGAIN_MS);
      }
    );
  }

  /** Reads a picture that could not be read again, calling off a wait for it set before. */
  private readAgain(url: string, moving: Moving): void {
    if (moving.again !== null) clearTimeout(moving.again);
    moving.again = null;
    moving.failed = false;
    this.readInto(url, moving);
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
        this.drawn(
          [...moving.wearers].some((wearer) =>
            typeof wearer.shadows === 'function' ? wearer.shadows() : !!wearer.shadows
          )
        );
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
    if (moving.again !== null) clearTimeout(moving.again);
    moving.again = null;
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
 * is read than says so (a larger part each time where it has not said yet), or one that cannot be
 * fetched.
 */
async function movingBytesAt(url: string): Promise<ArrayBuffer | null> {
  const response = await fetch(url);
  const reader = response.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array[] = [];
  let length = 0;
  let told: boolean | null = null;
  let askAt = HEAD_BYTES;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      parts.push(value);
      length += value.byteLength;
    }
    if (told === null && (done || length >= askAt)) {
      told = animationOfHead(joined(parts, length).buffer as ArrayBuffer) ?? (done ? false : null);
      askAt *= 4;
      if (told === false) {
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

/** The type a moving picture is read as, by its head: PNG, GIF, WebP or AVIF. */
function movingTypeOf(bytes: ArrayBuffer): string | null {
  const head = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
  const ascii = (from: number, length: number) => String.fromCharCode(...head.slice(from, from + length));
  if (head[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (ascii(0, 3) === 'GIF') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(4, 4) === 'ftyp') return 'image/avif';
  return null;
}
