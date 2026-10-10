import {
  LOOP_POINTS_MAX_DECODED_BYTES,
  loopPointsFitInMemory,
  loopRegionOf,
  readAudioLoopPoints,
} from '@axe/core/storage/audio-loop-points';
import { loopTaggedWav } from '@axe/testing/loop-tagged-audio';

const text = (value: string) => new TextEncoder().encode(value);

function join(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((part) => (part instanceof Uint8Array ? part : Uint8Array.from(part)));
  const out = new Uint8Array(arrays.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of arrays) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const u16le = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const u32le = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const u16be = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const u32be = (value: number) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

// ─── Ogg ─────────────────────────────────────────────────────────────────────

/** An Ogg stream holding the packets, at most `segmentsPerPage` lacing values to a page. */
function oggStream(packets: Uint8Array[], lastGranule: number, segmentsPerPage = 255): Uint8Array {
  const segments: Uint8Array[] = [];
  for (const packet of packets) {
    let at = 0;
    while (packet.length - at >= 255) {
      segments.push(packet.subarray(at, at + 255));
      at += 255;
    }
    segments.push(packet.subarray(at));
  }
  const pages: Uint8Array[] = [];
  for (let from = 0; from < segments.length; from += segmentsPerPage) {
    const onPage = segments.slice(from, from + segmentsPerPage);
    const isLast = from + segmentsPerPage >= segments.length;
    const granule = isLast ? lastGranule : 0;
    pages.push(
      join(
        text('OggS'),
        [0, 0],
        u32le(granule),
        u32le(0),
        u32le(7),
        u32le(pages.length),
        u32le(0),
        [onPage.length],
        onPage.map((segment) => segment.length),
        ...onPage
      )
    );
  }
  return join(...pages);
}

function vorbisHead(channels: number, rate: number): Uint8Array {
  return join([1], text('vorbis'), u32le(0), [channels], u32le(rate), u32le(0), u32le(0), u32le(0), [0xb8, 1]);
}

function comments(prefix: Uint8Array, entries: string[], vendor = 'test vendor'): Uint8Array {
  return join(
    prefix,
    u32le(vendor.length),
    text(vendor),
    u32le(entries.length),
    ...entries.flatMap((entry) => [u32le(text(entry).length), text(entry)])
  );
}

const vorbisComments = (entries: string[], vendor?: string) =>
  join(comments(join([3], text('vorbis')), entries, vendor), [1]);

function vorbisFile(entries: string[], { rate = 44100, channels = 2, samples = 441000, vendor = 'v' } = {}) {
  return oggStream([vorbisHead(channels, rate), vorbisComments(entries, vendor)], samples);
}

function opusFile(entries: string[], { preSkip = 312, samples = 48000 * 5 } = {}) {
  const head = join(text('OpusHead'), [1, 2], u16le(preSkip), u32le(44100), u16le(0), [0]);
  return oggStream([head, comments(text('OpusTags'), entries)], samples + preSkip);
}

// ─── FLAC ────────────────────────────────────────────────────────────────────

/** A FLAC file's metadata at 16 bits a sample, with its comments when given, and an ID3 tag in front if asked. */
function flacFile(entries: string[] | null, { rate = 44100, channels = 2, samples = 441000, id3 = false } = {}) {
  const info = new Uint8Array(34);
  info.set(u16be(4096), 0);
  info.set(u16be(4096), 2);
  info[10] = (rate >> 12) & 0xff;
  info[11] = (rate >> 4) & 0xff;
  info[12] = ((rate & 0x0f) << 4) | ((channels - 1) << 1);
  info[13] = (15 << 4) | (Math.floor(samples / 0x100000000) & 0x0f);
  info.set(u32be(samples >>> 0), 14);
  const block = (type: number, last: boolean, body: Uint8Array) =>
    join([(last ? 0x80 : 0) | type, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff], body);
  const file = join(
    text('fLaC'),
    block(0, entries === null, info),
    entries ? block(4, true, comments(new Uint8Array(), entries)) : new Uint8Array(),
    [0xff, 0xf8]
  );
  return id3 ? join(text('ID3'), [4, 0, 0, 0, 0, 0, 20], new Uint8Array(20), file) : file;
}

// ─── MP4 ─────────────────────────────────────────────────────────────────────

function box(type: string, ...children: (Uint8Array | number[])[]): Uint8Array {
  const body = join(...children);
  return join(
    u32be(body.length + 8),
    Array.from(type, (char) => char.charCodeAt(0)),
    body
  );
}

const fullBox = (type: string, ...children: (Uint8Array | number[])[]) => box(type, [0, 0, 0, 0], ...children);

function mp4File(ilst: Uint8Array, { timescale = 44100, duration = 44100 * 10, channels = 2 } = {}) {
  const mdhd = fullBox('mdhd', u32be(0), u32be(0), u32be(timescale), u32be(duration), u16be(0), u16be(0));
  const hdlr = fullBox('hdlr', u32be(0), text('soun'), u32be(0), u32be(0), u32be(0), [0]);
  const mp4a = box(
    'mp4a',
    [0, 0, 0, 0, 0, 0],
    u16be(1),
    u32be(0),
    u32be(0),
    u16be(channels),
    u16be(16),
    u32be(0),
    u32be(timescale << 16)
  );
  const stsd = fullBox('stsd', u32be(1), mp4a);
  const trak = box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', stsd))));
  const meta = fullBox(
    'meta',
    fullBox('hdlr', u32be(0), text('mdir'), u32be(0), u32be(0), u32be(0), [0]),
    box('ilst', ilst)
  );
  return join(box('ftyp', text('M4A '), u32be(0)), box('moov', trak, box('udta', meta)), box('mdat', [1, 2, 3]));
}

function freeform(name: string, value: string): Uint8Array {
  return box(
    '----',
    fullBox('mean', text('com.apple.iTunes')),
    fullBox('name', text(name)),
    box('data', u32be(1), u32be(0), text(value))
  );
}

describe('reading where a track asks to be looped', () => {
  describe('from an Ogg Vorbis file', () => {
    it('reads LOOPSTART and LOOPLENGTH, counted in samples, as seconds', () => {
      const points = readAudioLoopPoints(vorbisFile(['TITLE=森', 'LOOPSTART=44100', 'LOOPLENGTH=88200']));

      expect(points).toEqual({ start: 1, end: 3, duration: 10, channels: 2 });
    });

    it('reads the keys whatever their case, and LOOPEND in place of a length', () => {
      expect(readAudioLoopPoints(vorbisFile(['loopstart=22050', 'LoopEnd=66150']))).toMatchObject({
        start: 0.5,
        end: 1.5,
      });
    });

    it('loops to the end of the track when only its start is named', () => {
      expect(readAudioLoopPoints(vorbisFile(['LOOPSTART=44100']))?.end).toBeNull();
    });

    it('reads tags that run on over more than one page', () => {
      const file = vorbisFile(['LOOPSTART=44100', 'LOOPLENGTH=44100'], { vendor: 'x'.repeat(1200) });
      const spread = oggStream(
        [vorbisHead(2, 44100), vorbisComments(['LOOPSTART=44100', 'LOOPLENGTH=44100'], 'x'.repeat(1200))],
        441000,
        2
      );

      expect(readAudioLoopPoints(file)).toMatchObject({ start: 1, end: 2 });
      expect(readAudioLoopPoints(spread)).toMatchObject({ start: 1, end: 2, duration: 10 });
    });

    it('asks for no loop without LOOPSTART, or with one that is not a count of samples', () => {
      expect(readAudioLoopPoints(vorbisFile(['TITLE=森']))).toBeNull();
      expect(readAudioLoopPoints(vorbisFile(['LOOPSTART=1.5', 'LOOPLENGTH=10']))).toBeNull();
    });
  });

  describe('from an Ogg Opus file', () => {
    it('counts the samples at 48kHz, and the length without the samples skipped at its start', () => {
      expect(readAudioLoopPoints(opusFile(['LOOPSTART=48000', 'LOOPLENGTH=96000']))).toEqual({
        start: 1,
        end: 3,
        duration: 5,
        channels: 2,
      });
    });
  });

  describe('from a FLAC file', () => {
    it('reads LOOPSTART and LOOPLENGTH from its comments, with its rate and length from its stream info', () => {
      expect(readAudioLoopPoints(flacFile(['LOOPSTART=44100', 'LOOPLENGTH=88200']))).toEqual({
        start: 1,
        end: 3,
        duration: 10,
        channels: 2,
      });
    });

    it('reads it past an ID3 tag put in front of the file', () => {
      expect(readAudioLoopPoints(flacFile(['LOOPSTART=48000'], { rate: 48000, id3: true }))).toMatchObject({
        start: 1,
        end: null,
      });
    });

    it('asks for no loop without the tags, or without comments at all', () => {
      expect(readAudioLoopPoints(flacFile(['TITLE=森']))).toBeNull();
      expect(readAudioLoopPoints(flacFile(null))).toBeNull();
    });
  });

  describe('from a WAV file', () => {
    it('reads the first loop of its sampler chunk, whose end sample is part of the loop', () => {
      expect(
        readAudioLoopPoints(loopTaggedWav({ start: 22050, end: 66149 }, { rate: 22050, frames: 22050 * 4 }))
      ).toEqual({
        start: 1,
        end: 3,
        duration: 4,
        channels: 2,
      });
    });

    it('asks for no loop without a sampler chunk', () => {
      expect(readAudioLoopPoints(loopTaggedWav(null))).toBeNull();
    });
  });

  describe('from an MP4 or M4A file', () => {
    it('reads the freeform tags, counted in samples of its sound track', () => {
      const file = mp4File(join(freeform('LOOPSTART', '44100'), freeform('LOOPLENGTH', '132300')));

      expect(readAudioLoopPoints(file)).toEqual({ start: 1, end: 4, duration: 10, channels: 2 });
    });

    it('reads tags written out in a comment', () => {
      const comment = box('©cmt', box('data', u32be(1), u32be(0), text('LOOPSTART=88200\nLOOPLENGTH=44100')));

      expect(readAudioLoopPoints(mp4File(comment))).toMatchObject({ start: 2, end: 3 });
    });

    it('asks for no loop without the tags', () => {
      expect(readAudioLoopPoints(mp4File(freeform('ARTIST', 'someone')))).toBeNull();
    });
  });

  it('asks for no loop from a file of another kind, or one cut short', () => {
    expect(readAudioLoopPoints(join(text('ID3'), [4, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(readAudioLoopPoints(vorbisFile(['LOOPSTART=44100']).subarray(0, 40))).toBeNull();
    expect(readAudioLoopPoints(new Uint8Array())).toBeNull();
  });
});

describe('the part of a track that goes round', () => {
  const points = (start: number, end: number | null) => ({ start, end, duration: 10, channels: 2 });

  it('runs from the start named to the end named, or to the end of the track', () => {
    expect(loopRegionOf(points(1, 3), 10)).toEqual({ start: 1, end: 3 });
    expect(loopRegionOf(points(1, null), 10)).toEqual({ start: 1, end: 10 });
  });

  it('stops at the end of the track, and is nothing when it starts there or later', () => {
    expect(loopRegionOf(points(1, 12), 10)).toEqual({ start: 1, end: 10 });
    expect(loopRegionOf(points(10, null), 10)).toBeNull();
  });
});

describe('whether a track fits in memory to be looped', () => {
  it('is judged by its length and channels where the file gives them', () => {
    const minutes = (count: number) => ({ start: 0, end: null, duration: count * 60, channels: 2 });

    expect(loopPointsFitInMemory(minutes(3), 48000, 4_000_000)).toBe(true);
    expect(loopPointsFitInMemory(minutes(20), 48000, 4_000_000)).toBe(false);
    expect(LOOP_POINTS_MAX_DECODED_BYTES).toBeGreaterThan(3 * 60 * 48000 * 2 * 4);
  });

  it('is judged by the size of the file where it does not', () => {
    const unknown = { start: 0, end: null, duration: null, channels: null };

    expect(loopPointsFitInMemory(unknown, 48000, 2_000_000)).toBe(true);
    expect(loopPointsFitInMemory(unknown, 48000, 50_000_000)).toBe(false);
  });
});
