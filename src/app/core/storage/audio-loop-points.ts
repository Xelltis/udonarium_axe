/**
 * Where a track's file asks to be looped, read from the file itself.
 *
 * Game music is often made with an introduction that plays once and a part after it that goes
 * round, and the file names the part that goes round. An Ogg file (Vorbis or Opus), a FLAC file
 * and an MP4 or M4A file name it with the tags `LOOPSTART` and `LOOPLENGTH` (or `LOOPEND`), counted
 * in samples, as the RPG Maker series reads them; a WAV file names it with the first loop of its
 * `smpl` chunk.
 */
export interface AudioLoopPoints {
  /** Where the part that goes round starts, in seconds. */
  readonly start: number;
  /** Where it goes back to the start, in seconds, or null to go back at the end of the track. */
  readonly end: number | null;
  /** How long the whole track is, in seconds, or null when the file does not say. */
  readonly duration: number | null;
  /** How many channels the track has, or null when the file does not say. */
  readonly channels: number | null;
}

/** The most memory a track may take once decoded to be looped between its points. */
export const LOOP_POINTS_MAX_DECODED_BYTES = 192 * 1024 * 1024;

/** A file whose length the header does not give is decoded to be looped only up to this size. */
const LOOP_POINTS_MAX_FILE_BYTES_UNKNOWN_LENGTH = 8 * 1024 * 1024;

/**
 * Reads where a track asks to be looped from the bytes of its file, or null when it asks for no
 * loop, its loop cannot be read, or the file is of a kind that cannot name one.
 */
export function readAudioLoopPoints(bytes: Uint8Array): AudioLoopPoints | null {
  try {
    if (fourCc(bytes, 0) === 'OggS') return readOgg(bytes);
    const flacAt = afterId3(bytes);
    if (fourCc(bytes, flacAt) === 'fLaC') return readFlac(bytes, flacAt + 4);
    if (fourCc(bytes, 0) === 'RIFF' && fourCc(bytes, 8) === 'WAVE') return readWav(bytes);
    if (fourCc(bytes, 4) === 'ftyp') return readMp4(bytes);
  } catch {
    // A file cut short or out of shape asks for nothing that can be followed.
  }
  return null;
}

/**
 * Whether a track with these loop points can be decoded whole to loop between them without taking
 * more memory than is allowed, judged by its length and channels where the file gives them and by
 * the size of the file where it does not.
 */
export function loopPointsFitInMemory(points: AudioLoopPoints, sampleRate: number, fileBytes: number): boolean {
  if (points.duration === null || points.channels === null) {
    return fileBytes <= LOOP_POINTS_MAX_FILE_BYTES_UNKNOWN_LENGTH;
  }
  return points.duration * sampleRate * points.channels * 4 <= LOOP_POINTS_MAX_DECODED_BYTES;
}

/**
 * The part of a decoded track that goes round, in seconds: from the start the file names to its
 * end, or to the end of the track, cut to the track's length. Null when that leaves nothing to loop.
 */
export function loopRegionOf(points: AudioLoopPoints, duration: number): { start: number; end: number } | null {
  const end = points.end === null ? duration : Math.min(points.end, duration);
  if (!(points.start >= 0 && points.start < end)) return null;
  return { start: points.start, end };
}

/**
 * The loop named by tags in a comment list, counted in samples at the rate given. `LOOPLENGTH`
 * counts from `LOOPSTART`; `LOOPEND` names the sample to go back at. With neither, the loop runs to
 * the end of the track.
 */
function loopFromTags(
  tags: ReadonlyMap<string, string>,
  sampleRate: number,
  duration: number | null,
  channels: number | null
): AudioLoopPoints | null {
  const start = sampleCountOf(tags.get('LOOPSTART'));
  if (start === null || !(sampleRate > 0)) return null;
  const length = sampleCountOf(tags.get('LOOPLENGTH'));
  const endTag = sampleCountOf(tags.get('LOOPEND'));
  const endSamples = length !== null && length > 0 ? start + length : endTag !== null && endTag > start ? endTag : null;
  return {
    start: start / sampleRate,
    end: endSamples === null ? null : endSamples / sampleRate,
    duration,
    channels,
  };
}

function sampleCountOf(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Adds a `KEY=value` comment to the tags, its key in capitals since comment keys ignore case. */
function addTag(tags: Map<string, string>, comment: string): void {
  const at = comment.indexOf('=');
  if (at <= 0) return;
  tags.set(comment.slice(0, at).trim().toUpperCase(), comment.slice(at + 1));
}

// ─── Ogg ─────────────────────────────────────────────────────────────────────

function readOgg(bytes: Uint8Array): AudioLoopPoints | null {
  const packets: Uint8Array[] = [];
  let pieces: Uint8Array[] = [];
  let serial: number | null = null;
  let lastGranule: number | null = null;
  let offset = 0;
  while (offset + 27 <= bytes.length && fourCc(bytes, offset) === 'OggS') {
    const segments = bytes[offset + 26];
    const tableStart = offset + 27;
    let at = tableStart + segments;
    if (at > bytes.length) break;
    const pageSerial = u32le(bytes, offset + 14);
    serial ??= pageSerial;
    const ours = pageSerial === serial;
    for (let i = 0; i < segments; i++) {
      const lace = bytes[tableStart + i];
      if (ours && packets.length < 2) {
        pieces.push(bytes.subarray(at, Math.min(at + lace, bytes.length)));
        if (lace < 255) {
          packets.push(concat(pieces));
          pieces = [];
        }
      }
      at += lace;
    }
    if (ours) {
      const granule = granuleOf(bytes, offset + 6);
      if (granule !== null) lastGranule = granule;
    }
    offset = at;
  }
  if (packets.length < 2) return null;

  const [head, comments] = packets;
  let sampleRate: number;
  let channels: number;
  let preSkip = 0;
  let commentStart: number;
  if (head[0] === 1 && ascii(head, 1, 6) === 'vorbis') {
    channels = head[11];
    sampleRate = u32le(head, 12);
    if (!(comments[0] === 3 && ascii(comments, 1, 6) === 'vorbis')) return null;
    commentStart = 7;
  } else if (ascii(head, 0, 8) === 'OpusHead') {
    channels = head[9];
    preSkip = head[10] | (head[11] << 8);
    sampleRate = 48000;
    if (ascii(comments, 0, 8) !== 'OpusTags') return null;
    commentStart = 8;
  } else {
    return null;
  }
  const duration = lastGranule !== null && lastGranule > preSkip ? (lastGranule - preSkip) / sampleRate : null;
  return loopFromTags(vorbisComments(comments, commentStart), sampleRate, duration, channels || null);
}

function vorbisComments(packet: Uint8Array, start: number): Map<string, string> {
  const tags = new Map<string, string>();
  let at = start;
  const vendorLength = u32le(packet, at);
  at += 4 + vendorLength;
  const count = u32le(packet, at);
  at += 4;
  const decoder = new TextDecoder();
  for (let i = 0; i < count && at + 4 <= packet.length; i++) {
    const length = u32le(packet, at);
    at += 4;
    if (at + length > packet.length) break;
    addTag(tags, decoder.decode(packet.subarray(at, at + length)));
    at += length;
  }
  return tags;
}

/** A page's granule position, or null for a page on which no packet ends. */
function granuleOf(bytes: Uint8Array, at: number): number | null {
  const low = u32le(bytes, at);
  const high = u32le(bytes, at + 4);
  if (low === 0xffffffff && high === 0xffffffff) return null;
  return high * 0x100000000 + low;
}

// ─── FLAC ────────────────────────────────────────────────────────────────────

const FLAC_STREAMINFO = 0;
const FLAC_VORBIS_COMMENT = 4;

/** Reads the metadata blocks after the `fLaC` marker: the stream's rate and length, and its comments. */
function readFlac(bytes: Uint8Array, from: number): AudioLoopPoints | null {
  let sampleRate = 0;
  let channels = 0;
  let totalSamples = 0;
  let tags = new Map<string, string>();
  let at = from;
  for (let isLast = false; !isLast && at + 4 <= bytes.length;) {
    const header = bytes[at];
    isLast = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
    const body = at + 4;
    if (body + length > bytes.length) break;
    if (type === FLAC_STREAMINFO && length >= 18) {
      sampleRate = (bytes[body + 10] << 12) | (bytes[body + 11] << 4) | (bytes[body + 12] >> 4);
      channels = ((bytes[body + 12] >> 1) & 0x07) + 1;
      totalSamples = (bytes[body + 13] & 0x0f) * 0x100000000 + u32be(bytes, body + 14);
    } else if (type === FLAC_VORBIS_COMMENT) {
      tags = vorbisComments(bytes.subarray(body, body + length), 0);
    }
    at = body + length;
  }
  const duration = sampleRate > 0 && totalSamples > 0 ? totalSamples / sampleRate : null;
  return loopFromTags(tags, sampleRate, duration, channels || null);
}

/** Where a file starts once an ID3v2 tag put in front of it, as some tools do, is passed over. */
function afterId3(bytes: Uint8Array): number {
  if (ascii(bytes, 0, 3) !== 'ID3' || bytes.length < 10) return 0;
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

// ─── WAV ─────────────────────────────────────────────────────────────────────

function readWav(bytes: Uint8Array): AudioLoopPoints | null {
  let sampleRate = 0;
  let channels = 0;
  let blockAlign = 0;
  let dataBytes: number | null = null;
  let loop: { start: number; end: number } | null = null;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = fourCc(bytes, at);
    const size = u32le(bytes, at + 4);
    const body = at + 8;
    if (id === 'fmt ' && body + 16 <= bytes.length) {
      channels = u16le(bytes, body + 2);
      sampleRate = u32le(bytes, body + 4);
      blockAlign = u16le(bytes, body + 12);
    } else if (id === 'data') {
      dataBytes = size;
    } else if (id === 'smpl' && body + 36 <= bytes.length && u32le(bytes, body + 28) > 0 && body + 60 <= bytes.length) {
      loop = { start: u32le(bytes, body + 44), end: u32le(bytes, body + 48) };
    }
    at = body + size + (size % 2);
  }
  if (!loop || !(sampleRate > 0) || loop.end < loop.start) return null;
  return {
    start: loop.start / sampleRate,
    end: (loop.end + 1) / sampleRate,
    duration: dataBytes !== null && blockAlign > 0 ? dataBytes / blockAlign / sampleRate : null,
    channels: channels || null,
  };
}

// ─── MP4 / M4A ───────────────────────────────────────────────────────────────

interface Mp4Track {
  handler: string;
  timescale: number;
  duration: number;
  channels: number;
}

const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'ilst', 'edts']);

function readMp4(bytes: Uint8Array): AudioLoopPoints | null {
  const tags = new Map<string, string>();
  const tracks: Mp4Track[] = [];
  walkMp4(bytes, 0, bytes.length, tags, tracks, null);
  const sound = tracks.find((track) => track.handler === 'soun' && track.timescale > 0);
  if (!sound) return null;
  const duration = sound.duration > 0 ? sound.duration / sound.timescale : null;
  return loopFromTags(tags, sound.timescale, duration, sound.channels || null);
}

function walkMp4(
  bytes: Uint8Array,
  from: number,
  to: number,
  tags: Map<string, string>,
  tracks: Mp4Track[],
  track: Mp4Track | null
): void {
  let at = from;
  while (at + 8 <= to) {
    let size = u32be(bytes, at);
    const type = fourCc(bytes, at + 4);
    let header = 8;
    if (size === 1) {
      size = u32be(bytes, at + 8) * 0x100000000 + u32be(bytes, at + 12);
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) return;
    const body = at + header;
    const end = at + size;
    if (type === 'trak') {
      const found: Mp4Track = { handler: '', timescale: 0, duration: 0, channels: 0 };
      tracks.push(found);
      walkMp4(bytes, body, end, tags, tracks, found);
    } else if (MP4_CONTAINERS.has(type)) {
      walkMp4(bytes, body, end, tags, tracks, track);
    } else if (type === 'meta') {
      const isFullBox = fourCc(bytes, body + 4) !== 'hdlr';
      walkMp4(bytes, isFullBox ? body + 4 : body, end, tags, tracks, track);
    } else if (type === 'stsd') {
      walkMp4(bytes, body + 8, end, tags, tracks, track);
    } else if (type === 'mp4a' && track && body + 28 <= end) {
      track.channels = u16be(bytes, body + 16);
    } else if (type === 'hdlr' && track && body + 12 <= end) {
      track.handler = fourCc(bytes, body + 8);
    } else if (type === 'mdhd' && track) {
      const version = bytes[body];
      if (version === 1 && body + 32 <= end) {
        track.timescale = u32be(bytes, body + 20);
        track.duration = u32be(bytes, body + 24) * 0x100000000 + u32be(bytes, body + 28);
      } else if (body + 20 <= end) {
        track.timescale = u32be(bytes, body + 12);
        track.duration = u32be(bytes, body + 16);
      }
    } else if (type === '----') {
      readFreeformTag(bytes, body, end, tags);
    } else if (body + 16 <= end && fourCc(bytes, body + 4) === 'data') {
      for (const line of mp4Text(bytes, body, end).split(/\r?\n/)) addTag(tags, line);
    }
    at = end;
  }
}

/** Reads an iTunes freeform tag: a `name` box naming the key, and a `data` box holding its value as text. */
function readFreeformTag(bytes: Uint8Array, from: number, to: number, tags: Map<string, string>): void {
  let name = '';
  let value = '';
  let at = from;
  const decoder = new TextDecoder();
  while (at + 8 <= to) {
    const size = u32be(bytes, at);
    const type = fourCc(bytes, at + 4);
    if (size < 8 || at + size > to) return;
    if (type === 'name' && at + 12 <= at + size) name = decoder.decode(bytes.subarray(at + 12, at + size));
    if (type === 'data' && at + 16 <= at + size) value = decoder.decode(bytes.subarray(at + 16, at + size));
    at += size;
  }
  if (name) tags.set(name.trim().toUpperCase(), value);
}

/** The text of the `data` box that opens an item's body. */
function mp4Text(bytes: Uint8Array, body: number, end: number): string {
  const size = u32be(bytes, body);
  if (size < 16 || body + size > end) return '';
  return new TextDecoder().decode(bytes.subarray(body + 16, body + size));
}

// ─── bytes ───────────────────────────────────────────────────────────────────

function fourCc(bytes: Uint8Array, at: number): string {
  return ascii(bytes, at, 4);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  if (at + length > bytes.length) return '';
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function u16le(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8);
}

function u32le(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1];
}

function u32be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function concat(pieces: readonly Uint8Array[]): Uint8Array {
  if (pieces.length === 1) return pieces[0];
  const joined = new Uint8Array(pieces.reduce((total, piece) => total + piece.length, 0));
  let at = 0;
  for (const piece of pieces) {
    joined.set(piece, at);
    at += piece.length;
  }
  return joined;
}
