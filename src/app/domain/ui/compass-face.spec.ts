import { asCompassFace, COMPASS_FACES, DEFAULT_COMPASS_FACE, nextCompassFace } from '@axe/domain/ui/compass-face';

describe('the face a compass is drawn with', () => {
  it('is the plain one until somebody says otherwise', () => {
    expect(COMPASS_FACES).toContain(DEFAULT_COMPASS_FACE);
    expect(DEFAULT_COMPASS_FACE).toBe('modern');
  });

  it('names each face once', () => {
    expect(new Set(COMPASS_FACES).size).toBe(COMPASS_FACES.length);
  });

  it('reads back a face that was written down, and nothing else', () => {
    for (const face of COMPASS_FACES) expect(asCompassFace(face)).toBe(face);
    expect(asCompassFace('brass')).toBeNull();
    expect(asCompassFace(null)).toBeNull();
    expect(asCompassFace(3)).toBeNull();
  });

  it('comes back round to where it started', () => {
    let face = DEFAULT_COMPASS_FACE;
    for (let step = 0; step < COMPASS_FACES.length; step++) face = nextCompassFace(face);

    expect(face).toBe(DEFAULT_COMPASS_FACE);
  });

  it('passes through every face on the way round', () => {
    const seen = [DEFAULT_COMPASS_FACE];
    while (seen.length < COMPASS_FACES.length) seen.push(nextCompassFace(seen[seen.length - 1]));

    expect([...seen].sort()).toEqual([...COMPASS_FACES].sort());
  });
});
