import { extractArtworkUrl, readEmbeddedArtwork } from '@axe/core/storage/audio-id3';

const PNG = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 4, 5];
const PLAIN = [1, 2, 3, 4];

function text(value: string): number[] {
  return [...value].map((char) => char.charCodeAt(0));
}

function syncsafe(value: number): number[] {
  return [(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f];
}

function bigEndian32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** An ID3v2 tag of the version around the frames, with an extended header when given. */
function tag(majorVersion: number, frames: number[], extendedHeader: number[] = []): ArrayBuffer {
  const body = [...extendedHeader, ...frames];
  const flags = extendedHeader.length > 0 ? 0x40 : 0;
  return new Uint8Array([...text('ID3'), majorVersion, 0, flags, ...syncsafe(body.length), ...body]).buffer;
}

/** A v2.2 frame: three-byte id and size. */
function frameV2(id: string, data: number[]): number[] {
  return [...text(id), (data.length >> 16) & 0xff, (data.length >> 8) & 0xff, data.length & 0xff, ...data];
}

/** A v2.3 frame: four-byte id, plain size and two flag bytes. */
function frameV3(id: string, data: number[]): number[] {
  return [...text(id), ...bigEndian32(data.length), 0, 0, ...data];
}

/** A v2.4 frame: four-byte id, syncsafe size and two flag bytes. */
function frameV4(id: string, data: number[]): number[] {
  return [...text(id), ...syncsafe(data.length), 0, 0, ...data];
}

/** A PIC frame's data: Latin-1 text, a three-letter format, the picture type and a description. */
function pic(format: string, image: number[], description = 'cover'): number[] {
  return [0, ...text(format), 3, ...text(description), 0, ...image];
}

/** An APIC frame's data in Latin-1: a null-ended MIME type, the picture type and a description. */
function apic(mime: string, image: number[], description = 'cover'): number[] {
  return [0, ...text(mime), 0, 3, ...text(description), 0, ...image];
}

/** An APIC frame's data whose description is UTF-16 with a byte order mark, ended by a two-byte null. */
function apicUtf16(mime: string, image: number[]): number[] {
  const description = [0xff, 0xfe, ...text('c').flatMap((c) => [c, 0]), 0, 0];
  return [1, ...text(mime), 0, 3, ...description, ...image];
}

describe('readEmbeddedArtwork', () => {
  it('reads nothing from bytes without a tag, or with a tag holding no picture', () => {
    expect(readEmbeddedArtwork(new Uint8Array([...text('OggS'), 0, 0]).buffer)).toBeNull();
    expect(readEmbeddedArtwork(new Uint8Array(4).buffer)).toBeNull();
    expect(readEmbeddedArtwork(tag(3, frameV3('TIT2', [0, ...text('song')])))).toBeNull();
  });

  it('reads a v2.2 PIC frame, taking its three-letter format for the type', () => {
    const artwork = readEmbeddedArtwork(tag(2, frameV2('PIC', pic('PNG', PLAIN))));

    expect(artwork).toEqual({ type: 'image/png', bytes: new Uint8Array(PLAIN) });
    expect(readEmbeddedArtwork(tag(2, frameV2('PIC', pic('JPG', PLAIN))))?.type).toBe('image/jpeg');
  });

  it('reads a v2.3 APIC frame past the frames before it', () => {
    const frames = [...frameV3('TIT2', [0, ...text('song')]), ...frameV3('APIC', apic('image/jpeg', JPEG))];

    expect(readEmbeddedArtwork(tag(3, frames))).toEqual({ type: 'image/jpeg', bytes: new Uint8Array(JPEG) });
  });

  it('reads a v2.3 tag past its extended header, whose size leaves out its own four bytes', () => {
    const extended = [...bigEndian32(6), 0, 0, 0, 0, 0, 0];

    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', apic('image/png', PNG)), extended))?.type).toBe('image/png');
  });

  it('reads a v2.4 tag with syncsafe frame sizes past its syncsafe extended header', () => {
    const image = Array.from({ length: 200 }, (_, i) => i & 0xff);
    const extended = [...syncsafe(6), 1, 0];

    expect(readEmbeddedArtwork(tag(4, frameV4('APIC', apic('image/jpeg', image)), extended))).toEqual({
      type: 'image/jpeg',
      bytes: new Uint8Array(image),
    });
  });

  it('skips a UTF-16 description to its two-byte null', () => {
    expect(readEmbeddedArtwork(tag(4, frameV4('APIC', apicUtf16('image/png', PNG))))).toEqual({
      type: 'image/png',
      bytes: new Uint8Array(PNG),
    });
  });

  it('tells the type by the image bytes before the declared one, and takes the declared one otherwise', () => {
    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', apic('image/jpeg', PNG))))?.type).toBe('image/png');
    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', apic('image/png', JPEG))))?.type).toBe('image/jpeg');
    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', apic('image/gif', PLAIN))))?.type).toBe('image/gif');
    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', apic('image/webp', PLAIN))))?.type).toBe('image/webp');
    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', apic('', PLAIN))))?.type).toBe('image/jpeg');
  });

  it('stops at padding and at a frame that runs past the tag', () => {
    const padded = [...frameV3('TIT2', [0]), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...frameV3('APIC', apic('image/png', PNG))];
    expect(readEmbeddedArtwork(tag(3, padded))).toBeNull();

    const cut = tag(3, frameV3('APIC', apic('image/png', PNG))).slice(0, 30);
    expect(readEmbeddedArtwork(cut)).toBeNull();
  });

  it('reads nothing from a picture frame with no image bytes after its description', () => {
    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', apic('image/png', []))))).toBeNull();
    expect(readEmbeddedArtwork(tag(3, frameV3('APIC', [0, ...text('image/png'), 0])))).toBeNull();
  });
});

describe('extractArtworkUrl', () => {
  it('makes an object url for the artwork, typed as the bytes show, and none without artwork', () => {
    const made = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:artwork');

    expect(extractArtworkUrl(tag(3, frameV3('APIC', apic('image/jpeg', PNG))))).toBe('blob:artwork');
    expect(made.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((made.mock.calls[0][0] as Blob).type).toBe('image/png');

    made.mockClear();
    expect(extractArtworkUrl(new Uint8Array(PLAIN).buffer)).toBeNull();
    expect(made).not.toHaveBeenCalled();
    made.mockRestore();
  });
});
